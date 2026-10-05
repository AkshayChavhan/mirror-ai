import * as THREE from "three";
import { REQUIRED_BONES } from "@/lib/garment-model";
import type { GarmentPose } from "./garmentPose";
import type { GarmentKind } from "./garmentTemplates";
import { normalizeBoneName, type BoneName } from "./skeleton";

// Live 3D (task 72): a garment's uploaded .glb (task 67), rigged to a Mixamo skeleton, posed from the body.
// Mixamo bones are nested and rest in their own pose (often a T-pose), so they can't simply be placed like the
// templates' bones. Each frame starts from that rest pose and then:
//   1. scales the model to the person: its width to their shoulder width (hip width for a model without arms)
//      plus some ease, and its height to their torso length when their hips are in view (task 73),
//   2. turns it and moves it so its hips sit on the person's hips,
//   3. rotates the torso and each limb so the line from a bone to its child points where the person's does.
// Step 3 uses world positions, so it works whatever axes the artist gave the bones.

/** What Live 3D draws and poses: a template (task 65) or an uploaded model. */
export type LiveGarment = {
  object: THREE.Object3D;
  pose(pose: GarmentPose): void;
  /** Frees its geometry, materials, textures and skeletons. */
  dispose(): void;
};

/** A limb bone, the bone at its far end (whose start marks where the limb points), and the pose bone it follows. */
const LIMBS: readonly { bone: string; tip: string; follows: BoneName }[] = [
  { bone: "LeftArm", tip: "LeftForeArm", follows: "LeftArm" },
  { bone: "LeftForeArm", tip: "LeftHand", follows: "LeftForeArm" },
  { bone: "RightArm", tip: "RightForeArm", follows: "RightArm" },
  { bone: "RightForeArm", tip: "RightHand", follows: "RightForeArm" },
  { bone: "LeftUpLeg", tip: "LeftLeg", follows: "LeftUpLeg" },
  { bone: "LeftLeg", tip: "LeftFoot", follows: "LeftLeg" },
  { bone: "RightUpLeg", tip: "RightLeg", follows: "RightUpLeg" },
  { bone: "RightLeg", tip: "RightFoot", follows: "RightLeg" },
];

/** A model faces the camera, so in a mirrored preview its right side follows the person's left (and back). */
const otherSide = (name: string) =>
  name.startsWith("Left") ? `Right${name.slice(4)}` : name.startsWith("Right") ? `Left${name.slice(5)}` : name;

/**
 * Clothes are looser than the skeleton: a model is made this much wider (and deeper) than the person's joints,
 * so it covers their own clothes (task 73: a real Mixamo sweater looked too slim).
 */
export const EASE = 1.12;
/** How far the torso may be stretched or squashed against the width, so noisy tracking can't distort the garment. */
export const TORSO_STRETCH = { min: 0.75, max: 1.4 } as const;

/** Legs shrink to (almost) nothing when the hips aren't in view, like the templates' legs. */
const HIDDEN_SCALE = 1e-4;

/** The screen direction of a pose angle, in scene coordinates (0 = up, positive = counter-clockwise). */
const direction = (angle: number) => new THREE.Vector3(-Math.sin(angle), Math.cos(angle), 0);

/**
 * Makes an uploaded model's scene posable. Throws when it has no rigged (skinned) mesh, or misses a bone its
 * kind needs (the upload check of task 67 should already have refused such a file).
 */
export function fitGarmentModel(scene: THREE.Object3D, kind: GarmentKind): LiveGarment {
  const bones = new Map<string, THREE.Bone>();
  const meshes: THREE.SkinnedMesh[] = [];
  scene.traverse((node) => {
    if (node instanceof THREE.SkinnedMesh) {
      node.frustumCulled = false; // its bounds don't follow its bones
      meshes.push(node);
    }
    if (node instanceof THREE.Bone) {
      const name = normalizeBoneName(node.name);
      if (!bones.has(name)) bones.set(name, node);
    }
  });
  if (meshes.length === 0) throw new Error("The 3D model has no rigged mesh.");
  const missing = REQUIRED_BONES[kind].filter((name) => !bones.has(name));
  if (missing.length > 0) throw new Error(`The 3D model is missing the bones ${missing.join(", ")}.`);

  const root = new THREE.Group();
  root.name = `garment-model-${kind}`;
  root.add(scene);
  root.updateMatrixWorld(true);

  // The rest pose, to start every frame from (so nothing drifts).
  const rest = [...bones.values()].map((bone) => ({ bone, quaternion: bone.quaternion.clone(), scale: bone.scale.clone() }));

  const bone = (name: string) => bones.get(name);
  const at = (name: string) => bone(name)?.getWorldPosition(new THREE.Vector3());
  const midpoint = (a: string, b: string) => {
    const pa = at(a), pb = at(b);
    return pa && pb ? pa.add(pb).multiplyScalar(0.5) : undefined;
  };
  /** Where the model's hips are: between its thighs if it has them, else its Hips bone. */
  const hipsAt = () => midpoint("LeftUpLeg", "RightUpLeg") ?? (at("Hips") as THREE.Vector3);
  /** The torso's far end: between its shoulders if it has arms, else the first bone above the Spine. */
  const torsoTip = () => midpoint("LeftArm", "RightArm") ?? bone("Spine")?.children.find((c) => c instanceof THREE.Bone)?.getWorldPosition(new THREE.Vector3());

  // Its size at rest, to scale to the person: shoulder width, or hip width for a model without arms.
  const restWidth = (() => {
    const shoulders = at("LeftArm") && at("RightArm") ? (at("LeftArm") as THREE.Vector3).distanceTo(at("RightArm") as THREE.Vector3) : 0;
    if (shoulders > 0) return { by: "shoulders" as const, size: shoulders };
    const hips = at("LeftUpLeg") && at("RightUpLeg") ? (at("LeftUpLeg") as THREE.Vector3).distanceTo(at("RightUpLeg") as THREE.Vector3) : 0;
    if (hips > 0) return { by: "hips" as const, size: hips };
    throw new Error("The 3D model has no shoulder or hip width to size it by.");
  })();

  // Its torso at rest (hips to between the shoulders), to match the person's torso length. Models without arms
  // (trousers) have no torso to match.
  const restTorso = midpoint("LeftArm", "RightArm")?.distanceTo(hipsAt()) ?? 0;

  /** A node's rotation relative to the model's root: its own and its ancestors' rotations, below the root. */
  const rotationInModel = (node: THREE.Object3D) => {
    const chain: THREE.Object3D[] = [];
    for (let n: THREE.Object3D | null = node; n && n !== root; n = n.parent) chain.unshift(n);
    return chain.reduce((q, n) => q.multiply(n.quaternion), new THREE.Quaternion());
  };

  /**
   * Turns `name` so the line from it to `tip` points in `angle`'s screen direction. Worked out in the model's own
   * (unscaled, unturned) space: the root may be stretched unevenly (task 73), which would bend world angles.
   */
  const aim = (name: string, tip: () => THREE.Vector3 | undefined, angle: number) => {
    const target = bone(name);
    const end = tip();
    if (!target?.parent || !end) return;
    root.updateMatrixWorld(true);
    const head = root.worldToLocal(target.getWorldPosition(new THREE.Vector3()));
    const current = root.worldToLocal(end).sub(head);
    if (current.lengthSq() < 1e-12) return;
    // The screen direction, brought into the model's space: undo the root's turn, then its scale.
    const wanted = direction(angle).applyQuaternion(root.quaternion.clone().invert()).divide(root.scale).normalize();
    const turn = new THREE.Quaternion().setFromUnitVectors(current.normalize(), wanted);
    const inModel = turn.multiply(rotationInModel(target));
    target.quaternion.copy(rotationInModel(target.parent).invert().multiply(inModel));
  };

  return {
    object: root,
    pose(pose) {
      for (const r of rest) {
        r.bone.quaternion.copy(r.quaternion);
        r.bone.scale.copy(r.scale);
      }
      // 1–2. Size, turn and place: the model's hips on the person's hips (screen y points down, scene y up).
      const personWidth =
        restWidth.by === "shoulders"
          ? pose.scale
          : Math.hypot(pose.bones.LeftUpLeg.x - pose.bones.RightUpLeg.x, pose.bones.LeftUpLeg.y - pose.bones.RightUpLeg.y);
      const width = (personWidth / restWidth.size) * EASE;
      // Height: the person's torso length, when their hips are really in view (not estimated) and the model has a
      // torso. Otherwise the same as the width, so the garment keeps its own proportions.
      const torso = pose.legsInView && restTorso > 0 && pose.bones.Spine.length > 0 ? pose.bones.Spine.length / restTorso : 0;
      const height = torso > 0 ? width * THREE.MathUtils.clamp(torso / width, TORSO_STRETCH.min, TORSO_STRETCH.max) : width;
      root.scale.set(width, height, width);
      root.rotation.set(0, pose.turn, 0);
      root.position.set(0, 0, 0);
      root.updateMatrixWorld(true);
      const hips = hipsAt();
      root.position.set(pose.bones.Spine.x - hips.x, -pose.bones.Spine.y - hips.y, -hips.z);

      // 3. The torso first (the arms hang from it), then each limb from the shoulder or hip outwards.
      aim("Spine", torsoTip, pose.bones.Spine.angle);
      for (const limb of LIMBS) {
        const side = (name: string) => (pose.mirrored ? otherSide(name) : name);
        aim(side(limb.bone), () => at(side(limb.tip)), pose.bones[limb.follows].angle);
      }
      if (!pose.legsInView) {
        for (const name of ["LeftUpLeg", "RightUpLeg"]) bone(name)?.scale.setScalar(HIDDEN_SCALE);
      }
      root.updateMatrixWorld(true);
    },
    dispose() {
      root.removeFromParent();
      scene.traverse((node) => {
        if (node instanceof THREE.SkinnedMesh) node.skeleton.dispose(); // frees its GPU bone texture
        if (node instanceof THREE.Mesh) {
          node.geometry.dispose();
          for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
            for (const value of Object.values(material)) if (value instanceof THREE.Texture) value.dispose();
            material.dispose();
          }
        }
      });
    },
  };
}

/** Loads a model's scene from its URL (GLTFLoader in the browser; a fake in unit tests). */
export type ModelLoader = (url: string) => Promise<THREE.Object3D>;

const loadGltfScene: ModelLoader = async (url) => {
  const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js"); // only when a model is used
  return (await new GLTFLoader().loadAsync(url)).scene;
};

/** Loads a garment's uploaded model and makes it posable. Throws if it can't be loaded or used. */
export async function loadGarmentModel(url: string, kind: GarmentKind, load: ModelLoader = loadGltfScene): Promise<LiveGarment> {
  return fitGarmentModel(await load(url), kind);
}
