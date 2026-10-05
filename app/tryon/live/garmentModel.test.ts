// @vitest-environment node
import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { EASE, TORSO_STRETCH, fitGarmentModel, loadGarmentModel } from "./garmentModel";
import type { BoneTarget, GarmentPose } from "./garmentPose";
import type { BoneName } from "./skeleton";

// A synthetic Mixamo-style model, built in three.js (no file needed): a T-pose facing +Z, in metres, with a
// skinned mesh bound to the bones. The tests pose it and check where its joints end up.

type Spec = { name: string; parent?: string; at: [number, number, number] };
const T_POSE: Spec[] = [
  { name: "Hips", at: [0, 1, 0] },
  { name: "Spine", parent: "Hips", at: [0, 1.1, 0] },
  { name: "Spine1", parent: "Spine", at: [0, 1.25, 0] },
  { name: "Spine2", parent: "Spine1", at: [0, 1.4, 0] },
  { name: "Neck", parent: "Spine2", at: [0, 1.55, 0] },
  { name: "LeftShoulder", parent: "Spine2", at: [0.05, 1.5, 0] },
  { name: "LeftArm", parent: "LeftShoulder", at: [0.18, 1.5, 0] },
  { name: "LeftForeArm", parent: "LeftArm", at: [0.46, 1.5, 0] },
  { name: "LeftHand", parent: "LeftForeArm", at: [0.71, 1.5, 0] },
  { name: "RightShoulder", parent: "Spine2", at: [-0.05, 1.5, 0] },
  { name: "RightArm", parent: "RightShoulder", at: [-0.18, 1.5, 0] },
  { name: "RightForeArm", parent: "RightArm", at: [-0.46, 1.5, 0] },
  { name: "RightHand", parent: "RightForeArm", at: [-0.71, 1.5, 0] },
  { name: "LeftUpLeg", parent: "Hips", at: [0.1, 0.95, 0] },
  { name: "LeftLeg", parent: "LeftUpLeg", at: [0.1, 0.5, 0] },
  { name: "LeftFoot", parent: "LeftLeg", at: [0.1, 0.08, 0] },
  { name: "RightUpLeg", parent: "Hips", at: [-0.1, 0.95, 0] },
  { name: "RightLeg", parent: "RightUpLeg", at: [-0.1, 0.5, 0] },
  { name: "RightFoot", parent: "RightLeg", at: [-0.1, 0.08, 0] },
];
const REST_SHOULDERS = 0.36; // LeftArm to RightArm
const REST_HIPS = 0.2; // LeftUpLeg to RightUpLeg
const REST_TORSO = 0.55; // between the thighs (y 0.95) to between the shoulders (y 1.5)

type Built = { scene: THREE.Group; bones: Map<string, THREE.Bone>; mesh: THREE.SkinnedMesh; texture: THREE.Texture };

/**
 * Builds the model. `twist` gives every bone its own odd rest rotation (as real rigs have), keeping the joints
 * where they are. `unit` scales the armature like a centimetre rig (positions × 1/unit, armature × unit).
 */
function model({ prefix = "mixamorig:", twist = false, unit = 1, without = [] as string[], forward = 0 } = {}): Built {
  // `forward` brings the forearms and hands that far in front (+z), like rigs whose arms don't rest flat.
  const reach = (s: Spec): Spec =>
    /ForeArm$|Hand$/.test(s.name) ? { ...s, at: [s.at[0], s.at[1], s.at[2] + forward * (/Hand$/.test(s.name) ? 2 : 1)] } : s;
  const specs = T_POSE.filter((s) => !without.includes(s.name)).map(reach);
  const spec = (name: string) => specs.find((s) => s.name === name) as Spec;
  const worldRotation = (index: number) =>
    twist ? new THREE.Quaternion().setFromEuler(new THREE.Euler(0.3 * index, 0.7 - 0.2 * index, -0.4 * index)) : new THREE.Quaternion();
  const bones = new Map<string, THREE.Bone>();
  specs.forEach((s, i) => {
    const bone = new THREE.Bone();
    bone.name = `${prefix}${s.name}`;
    bone.userData.world = worldRotation(i);
    bones.set(s.name, bone);
  });
  for (const s of specs) {
    const bone = bones.get(s.name) as THREE.Bone;
    const parent = s.parent ? bones.get(s.parent) : undefined;
    const parentAt = s.parent ? spec(s.parent).at : [0, 0, 0];
    const parentWorld: THREE.Quaternion = parent ? parent.userData.world : new THREE.Quaternion();
    const inverse = parentWorld.clone().invert();
    bone.position.set(s.at[0] - parentAt[0], s.at[1] - parentAt[1], s.at[2] - parentAt[2]).divideScalar(unit).applyQuaternion(inverse);
    bone.quaternion.copy(inverse.multiply(bone.userData.world));
    parent?.add(bone);
  }
  const armature = new THREE.Object3D();
  armature.scale.setScalar(unit);
  armature.add(bones.get("Hips") as THREE.Bone);
  const geometry = new THREE.BoxGeometry(0.1, 0.1, 0.1);
  const count = geometry.attributes.position.count;
  geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(new Uint16Array(count * 4), 4));
  geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(new Float32Array(count * 4).fill(0.25), 4));
  const texture = new THREE.Texture();
  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial({ map: texture }));
  armature.add(mesh);
  mesh.bind(new THREE.Skeleton([...bones.values()]));
  const scene = new THREE.Group();
  scene.add(armature);
  return { scene, bones, mesh, texture };
}

/** A person facing the camera, unmirrored (their left on the screen's right), arms and legs hanging down. */
function pose(change: Partial<Omit<GarmentPose, "bones">> & { bones?: Partial<Record<BoneName, Partial<BoneTarget>>> } = {}): GarmentPose {
  const target = (x: number, y: number, angle: number, length: number): BoneTarget => ({ x, y, angle, length, visible: true });
  const bones: Record<BoneName, BoneTarget> = {
    Spine: target(500, 600, 0, 300),
    Hips: target(500, 600, Math.PI, 220),
    LeftArm: target(600, 300, Math.PI, 150),
    LeftForeArm: target(600, 450, Math.PI, 140),
    RightArm: target(400, 300, Math.PI, 150),
    RightForeArm: target(400, 450, Math.PI, 140),
    LeftUpLeg: target(550, 600, Math.PI, 220),
    LeftLeg: target(550, 820, Math.PI, 210),
    RightUpLeg: target(450, 600, Math.PI, 220),
    RightLeg: target(450, 820, Math.PI, 210),
  };
  for (const [name, values] of Object.entries(change.bones ?? {})) Object.assign(bones[name as BoneName], values);
  return { scale: 200, turn: 0, legsInView: true, mirrored: false, ...change, bones };
}

const at = (built: Built, name: string) => (built.bones.get(name) as THREE.Bone).getWorldPosition(new THREE.Vector3());
/** The screen direction (scene coordinates) from one joint to another, after posing. */
const pointing = (built: Built, from: string, to: string) => at(built, to).sub(at(built, from)).normalize();
const direction = (angle: number) => new THREE.Vector3(-Math.sin(angle), Math.cos(angle), 0);
const expectClose = (actual: THREE.Vector3, expected: THREE.Vector3, digits = 3) => {
  expect(actual.x).toBeCloseTo(expected.x, digits);
  expect(actual.y).toBeCloseTo(expected.y, digits);
  expect(actual.z).toBeCloseTo(expected.z, digits);
};

describe("fitGarmentModel", () => {
  it("finds the Mixamo bones (with Mixamo's prefix), and keeps the mesh drawn while posed", () => {
    const built = model();
    const garment = fitGarmentModel(built.scene, "UPPER");
    expect(garment.object.children).toContain(built.scene);
    expect(built.mesh.frustumCulled).toBe(false);
  });

  it("puts the model's hips on the person's hips (screen y flipped) and sizes it by shoulder width, plus ease", () => {
    const built = model();
    const garment = fitGarmentModel(built.scene, "UPPER");
    garment.pose(pose());
    expect(garment.object.scale.x).toBeCloseTo((200 / REST_SHOULDERS) * EASE);
    const hips = at(built, "LeftUpLeg").add(at(built, "RightUpLeg")).multiplyScalar(0.5);
    expectClose(hips, new THREE.Vector3(500, -600, 0), 1);
  });

  it("points the torso, upper arms and forearms where the person's point", () => {
    const built = model();
    const garment = fitGarmentModel(built.scene, "UPPER");
    const raised = -Math.PI / 2 + 0.3; // the left upper arm out to the screen's right, a little up
    const bent = 0.4; // the left forearm up, tilted to the screen's left
    garment.pose(pose({ bones: { Spine: { angle: 0.2 }, LeftArm: { angle: raised }, LeftForeArm: { angle: bent } } }));
    const shoulders = at(built, "LeftArm").add(at(built, "RightArm")).multiplyScalar(0.5);
    expectClose(shoulders.sub(at(built, "Spine")).normalize(), direction(0.2));
    expectClose(pointing(built, "LeftArm", "LeftForeArm"), direction(raised));
    expectClose(pointing(built, "LeftForeArm", "LeftHand"), direction(bent));
    expectClose(pointing(built, "RightArm", "RightForeArm"), direction(Math.PI)); // hanging down
  });

  it("points the thighs and shins where the person's legs point", () => {
    const built = model();
    const garment = fitGarmentModel(built.scene, "LOWER");
    garment.pose(pose({ bones: { LeftUpLeg: { angle: Math.PI - 0.3 }, LeftLeg: { angle: Math.PI + 0.2 } } }));
    expectClose(pointing(built, "LeftUpLeg", "LeftLeg"), direction(Math.PI - 0.3));
    expectClose(pointing(built, "LeftLeg", "LeftFoot"), direction(Math.PI + 0.2));
  });

  it("in a mirrored preview, the model's RIGHT side follows the person's left (it faces the camera)", () => {
    const built = model();
    const garment = fitGarmentModel(built.scene, "UPPER");
    const left = -Math.PI / 2; // the person's left arm out to the screen's left... in the mirror, its left side
    garment.pose(pose({ mirrored: true, bones: { LeftArm: { x: 400, angle: Math.PI / 2 }, RightArm: { x: 600, angle: left } } }));
    expectClose(pointing(built, "RightArm", "RightForeArm"), direction(Math.PI / 2)); // the model's right: screen left
    expectClose(pointing(built, "LeftArm", "LeftForeArm"), direction(left));
  });

  it("turns the torso: a positive turn brings the screen-left shoulder towards the camera", () => {
    const built = model();
    const garment = fitGarmentModel(built.scene, "UPPER");
    garment.pose(pose({ turn: 0.5 }));
    expect(at(built, "RightArm").z).toBeGreaterThan(at(built, "LeftArm").z + 10); // the model's right is on the screen's left
  });

  it("shrinks the legs away when the hips aren't in view (seated), like the templates", () => {
    const built = model();
    const garment = fitGarmentModel(built.scene, "UPPER");
    garment.pose(pose({ legsInView: false }));
    expect((built.bones.get("LeftUpLeg") as THREE.Bone).scale.x).toBeLessThan(0.001);
    garment.pose(pose());
    expect((built.bones.get("LeftUpLeg") as THREE.Bone).scale.x).toBeCloseTo(1); // back when they're seen
  });

  it("starts every frame from the rest pose, so nothing drifts (not even a bone's roll around its own axis)", () => {
    const built = model({ forward: 0.08, twist: true }); // arms resting a little forward: aiming them can add roll
    const garment = fitGarmentModel(built.scene, "UPPER");
    const a = pose({ bones: { LeftArm: { angle: -1 } } });
    const rotations = () => ["Spine", "LeftArm", "LeftForeArm", "RightArm", "LeftUpLeg"].map((name) => (built.bones.get(name) as THREE.Bone).quaternion.clone());
    garment.pose(a);
    const first = { hand: at(built, "LeftHand"), rotations: rotations() };
    // A cycle that doesn't retrace itself (A → B → C → A), the torso turned differently in each frame: going
    // straight back (A → B → A) would undo any roll by itself.
    garment.pose(pose({ bones: { LeftArm: { angle: 2 }, LeftForeArm: { angle: -2.5 }, Spine: { angle: 0.5 } }, turn: 0.4 }));
    garment.pose(pose({ bones: { LeftArm: { angle: -0.4 }, LeftForeArm: { angle: 1.1 }, Spine: { angle: -0.3 } }, turn: -0.6 }));
    garment.pose(a);
    expectClose(at(built, "LeftHand"), first.hand, 2);
    // Aiming is absolute, so positions alone can't show drift: a bone's roll around its own axis would still
    // creep frame after frame. Its rotation must come out exactly the same.
    rotations().forEach((rotation, i) => expect(rotation.angleTo(first.rotations[i])).toBeLessThan(1e-6));
  });

  it("works whatever axes the rig's bones have, and in centimetre rigs", () => {
    for (const options of [{ twist: true }, { unit: 0.01 }, { twist: true, unit: 0.01 }]) {
      const built = model(options);
      const garment = fitGarmentModel(built.scene, "UPPER");
      garment.pose(pose({ bones: { LeftArm: { angle: -1.2 }, LeftForeArm: { angle: 0.3 } } }));
      expect(garment.object.scale.x).toBeCloseTo((200 / REST_SHOULDERS) * EASE); // the armature's unit cancels out: same real size
      expectClose(pointing(built, "LeftArm", "LeftForeArm"), direction(-1.2));
      expectClose(pointing(built, "LeftForeArm", "LeftHand"), direction(0.3));
    }
  });

  it("sizes a model without arms (trousers) by hip width", () => {
    const built = model({ without: ["LeftShoulder", "LeftArm", "LeftForeArm", "LeftHand", "RightShoulder", "RightArm", "RightForeArm", "RightHand"] });
    const garment = fitGarmentModel(built.scene, "LOWER");
    garment.pose(pose()); // the person's thighs start 100 px apart
    expect(garment.object.scale.x).toBeCloseTo((100 / REST_HIPS) * EASE);
    expect(garment.object.scale.y).toBeCloseTo(garment.object.scale.x); // no torso to match: its own proportions
    expectClose(pointing(built, "LeftUpLeg", "LeftLeg"), direction(Math.PI));
  });

  describe("fitting the body (task 73)", () => {
    it("is wider (and deeper) than the person's joints by the ease, so it covers their own clothes", () => {
      const built = model();
      const garment = fitGarmentModel(built.scene, "UPPER");
      garment.pose(pose());
      expect(EASE).toBeGreaterThan(1);
      expect(at(built, "LeftArm").distanceTo(at(built, "RightArm"))).toBeCloseTo(200 * EASE, 1); // the person: 200 px
      expect(garment.object.scale.z).toBeCloseTo(garment.object.scale.x);
    });

    it("matches the person's torso length (hips to shoulders) when their hips are in view", () => {
      const built = model();
      const garment = fitGarmentModel(built.scene, "UPPER");
      garment.pose(pose({ bones: { Spine: { length: 300 } } }));
      expect(garment.object.scale.y).toBeCloseTo(300 / REST_TORSO);
      const hips = at(built, "LeftUpLeg").add(at(built, "RightUpLeg")).multiplyScalar(0.5);
      const shoulders = at(built, "LeftArm").add(at(built, "RightArm")).multiplyScalar(0.5);
      expect(shoulders.distanceTo(hips)).toBeCloseTo(300, 0);
    });

    it("keeps the garment's own proportions when the hips are only estimated (close up, seated)", () => {
      const built = model();
      const garment = fitGarmentModel(built.scene, "UPPER");
      garment.pose(pose({ legsInView: false, bones: { Spine: { length: 300 } } }));
      expect(garment.object.scale.y).toBeCloseTo(garment.object.scale.x);
    });

    it("limits the stretch, so noisy tracking can't make it absurdly long or short", () => {
      const built = model();
      const garment = fitGarmentModel(built.scene, "UPPER");
      garment.pose(pose({ bones: { Spine: { length: 5000 } } }));
      expect(garment.object.scale.y / garment.object.scale.x).toBeCloseTo(TORSO_STRETCH.max);
      garment.pose(pose({ bones: { Spine: { length: 20 } } }));
      expect(garment.object.scale.y / garment.object.scale.x).toBeCloseTo(TORSO_STRETCH.min);
    });

    it("still points the arms exactly while stretched unevenly", () => {
      const built = model({ twist: true });
      const garment = fitGarmentModel(built.scene, "UPPER");
      garment.pose(pose({ bones: { Spine: { length: 420, angle: 0.25 }, LeftArm: { angle: -1.1 }, LeftForeArm: { angle: 0.6 } }, turn: 0.3 }));
      expect(garment.object.scale.y).not.toBeCloseTo(garment.object.scale.x, 0); // really uneven
      expectClose(pointing(built, "LeftArm", "LeftForeArm"), direction(-1.1));
      expectClose(pointing(built, "LeftForeArm", "LeftHand"), direction(0.6));
      const shoulders = at(built, "LeftArm").add(at(built, "RightArm")).multiplyScalar(0.5);
      const spine = shoulders.sub(at(built, "Spine")).normalize();
      expect(spine.x).toBeCloseTo(direction(0.25).x, 2);
      expect(spine.y).toBeCloseTo(direction(0.25).y, 2);
    });
  });

  it("refuses a model with no rigged mesh, or without the bones its kind needs", () => {
    const unrigged = new THREE.Group();
    unrigged.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()));
    expect(() => fitGarmentModel(unrigged, "UPPER")).toThrow("The 3D model has no rigged mesh.");
    expect(() => fitGarmentModel(model({ without: ["RightArm", "RightForeArm", "RightHand"] }).scene, "UPPER")).toThrow(
      "The 3D model is missing the bones RightArm.",
    );
  });

  it("dispose() frees the geometry, materials, textures and skeleton, and takes the model out of the scene", () => {
    const built = model();
    const garment = fitGarmentModel(built.scene, "UPPER");
    const parent = new THREE.Scene();
    parent.add(garment.object);
    const spies = [
      vi.spyOn(built.mesh.geometry, "dispose"),
      vi.spyOn(built.mesh.material as THREE.Material, "dispose"),
      vi.spyOn(built.texture, "dispose"),
      vi.spyOn(built.mesh.skeleton, "dispose"),
    ];
    garment.dispose();
    for (const spy of spies) expect(spy).toHaveBeenCalled();
    expect(parent.children).not.toContain(garment.object);
  });
});

describe("loadGarmentModel", () => {
  it("loads the model from its URL with the given loader, then makes it posable", async () => {
    const built = model();
    const load = vi.fn().mockResolvedValue(built.scene);
    const garment = await loadGarmentModel("https://res.cloudinary.com/demo/raw/upload/v1/mirror-ai/models/m1", "UPPER", load);
    expect(load).toHaveBeenCalledWith("https://res.cloudinary.com/demo/raw/upload/v1/mirror-ai/models/m1");
    expect(garment.object.children).toContain(built.scene);
  });

  it("passes on a loading failure, for Live 3D to fall back to the template", async () => {
    await expect(loadGarmentModel("https://x", "UPPER", vi.fn().mockRejectedValue(new Error("404")))).rejects.toThrow("404");
  });
});
