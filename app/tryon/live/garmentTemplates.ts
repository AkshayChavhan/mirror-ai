import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { GarmentPose } from "./garmentPose";
import { FOREARM_RATIO, SHIN_RATIO, THIGH_RATIO, UPPER_ARM_RATIO } from "./garmentPose";
import { BONES, type BoneName } from "./skeleton";

// Live 3D (task 65): the built-in 3D garments for Top, Bottom and Dress, used when a product has no uploaded
// .glb (task 67). Each one is a SkinnedMesh with the Mixamo-style bones from skeleton.ts.
//
// How the rig works: every bone rests at the origin pointing up (+Y), so its bind matrix is the identity, and
// each part's vertices are written in that part's own bone space (from y = 0 at the segment's start to y =
// its rest length at the end). Posing a bone (applyGarmentPose) moves, turns and stretches its part rigidly.
// Units: one template unit is one shoulder width; posing scales it to pixels.

export type GarmentKind = "UPPER" | "LOWER" | "OVERALL";

/** The colors and print for a garment, from the product photo (garmentLook.ts). */
export type GarmentMaterials = { color: THREE.ColorRepresentation; print: THREE.Texture | null };

/** One tube-shaped part, in its bone's space (template units). */
type Part = {
  bone: BoneName;
  /** Where the tube starts and ends along the bone (y); a little below 0 overlaps the part before it. */
  from: number;
  to: number;
  /** Radius at `from` and at `to` (template units; 0.5 is half a shoulder width). */
  radiusFrom: number;
  radiusTo: number;
  /** Front-to-back depth as a share of the width (an oval cross-section). */
  depth: number;
  /** For the printed body: the part of the photo it shows (u across, v up), else plain color. */
  print?: { u0: number; u1: number; v0: number; v1: number };
};

/** Each bone's rest length (template units): posing stretches it to the real segment length. */
export const REST_LENGTHS: Record<BoneName, number> = {
  Spine: 1.35,
  Hips: THIGH_RATIO,
  LeftArm: UPPER_ARM_RATIO,
  RightArm: UPPER_ARM_RATIO,
  LeftForeArm: FOREARM_RATIO,
  RightForeArm: FOREARM_RATIO,
  LeftUpLeg: THIGH_RATIO,
  RightUpLeg: THIGH_RATIO,
  LeftLeg: SHIN_RATIO,
  RightLeg: SHIN_RATIO,
};

/** Bones whose parts disappear when the hips aren't in view (seated): legs and skirt. Arms always show. */
export const HIDE_WHEN_UNSEEN: ReadonlySet<BoneName> = new Set(["Hips", "LeftUpLeg", "LeftLeg", "RightUpLeg", "RightLeg"]);

const TORSO: Part = { bone: "Spine", from: -0.04, to: 1.4, radiusFrom: 0.5, radiusTo: 0.56, depth: 0.5, print: { u0: 0.2, u1: 0.8, v0: 0.04, v1: 0.96 } };
const sleeve = (bone: BoneName): Part => ({ bone, from: -0.1, to: 0.42, radiusFrom: 0.2, radiusTo: 0.16, depth: 0.95 });

export const TEMPLATES: Record<GarmentKind, Part[]> = {
  // A t-shirt: the body (printed) and two short sleeves.
  UPPER: [TORSO, sleeve("LeftArm"), sleeve("RightArm")],
  // Trousers: a waistband, then thighs and shins.
  LOWER: [
    { bone: "Spine", from: -0.06, to: 0.22, radiusFrom: 0.5, radiusTo: 0.47, depth: 0.55 },
    { bone: "LeftUpLeg", from: -0.04, to: 1.04, radiusFrom: 0.25, radiusTo: 0.18, depth: 0.95 },
    { bone: "RightUpLeg", from: -0.04, to: 1.04, radiusFrom: 0.25, radiusTo: 0.18, depth: 0.95 },
    { bone: "LeftLeg", from: -0.04, to: 1.0, radiusFrom: 0.18, radiusTo: 0.15, depth: 0.95 },
    { bone: "RightLeg", from: -0.04, to: 1.0, radiusFrom: 0.18, radiusTo: 0.15, depth: 0.95 },
  ],
  // A sleeveless dress: the body (printed) and a flared skirt down to the knees.
  OVERALL: [{ ...TORSO, radiusTo: 0.52 }, { bone: "Hips", from: -0.02, to: 1.0, radiusFrom: 0.5, radiusTo: 0.85, depth: 0.6 }],
};

const RADIAL_SEGMENTS = 24;
const HEIGHT_SEGMENTS = 6;

/** One part as geometry: an open oval tube along +Y, skinned 100% to its bone, with UVs for the print. */
function partGeometry(part: Part, boneIndex: number): THREE.BufferGeometry {
  // CylinderGeometry puts radiusTop at +y, so "to" is the top here.
  const geometry = new THREE.CylinderGeometry(part.radiusTo, part.radiusFrom, part.to - part.from, RADIAL_SEGMENTS, HEIGHT_SEGMENTS, true);
  geometry.scale(1, 1, part.depth);
  geometry.translate(0, (part.from + part.to) / 2, 0);

  const position = geometry.getAttribute("position");
  const uv = geometry.getAttribute("uv");
  const width = 2 * Math.max(part.radiusFrom, part.radiusTo);
  for (let i = 0; i < position.count; i++) {
    if (part.print) {
      // A planar projection from the front: the photo's middle columns across the body, bottom to top along it.
      // (The sides and back get the same projection; they face away from the camera.)
      const across = position.getX(i) / width + 0.5;
      const along = (position.getY(i) - part.from) / (part.to - part.from);
      const { u0, u1, v0, v1 } = part.print;
      uv.setXY(i, u0 + across * (u1 - u0), v0 + along * (v1 - v0));
    }
  }
  uv.needsUpdate = true;

  const count = position.count;
  geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(new Array(count * 4).fill(0).map((_, k) => (k % 4 === 0 ? boneIndex : 0)), 4));
  geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(new Array(count * 4).fill(0).map((_, k) => (k % 4 === 0 ? 1 : 0)), 4));
  return geometry;
}

export type Garment = {
  mesh: THREE.SkinnedMesh;
  bones: Record<BoneName, THREE.Bone>;
  /** Frees the geometry, materials and skeleton (the print texture belongs to the caller). */
  dispose(): void;
};

/** Builds the 3D template for a garment kind, with the product's color and print. */
export function buildGarment(kind: GarmentKind, look: GarmentMaterials): Garment {
  const root = new THREE.Bone();
  root.name = "Root";
  const bones = {} as Record<BoneName, THREE.Bone>;
  for (const name of BONES) {
    const bone = new THREE.Bone();
    bone.name = name;
    bone.rotation.order = "ZYX"; // turn (yaw) around the bone first, then the screen angle
    root.add(bone);
    bones[name] = bone;
  }

  const parts = TEMPLATES[kind];
  const geometry = mergeGeometries(parts.map((part) => partGeometry(part, BONES.indexOf(part.bone))), true);
  if (!geometry) throw new Error(`Couldn't build the ${kind} garment.`);
  // One group per part: printed parts use material 0, plain parts material 1.
  geometry.groups.forEach((group, i) => (group.materialIndex = parts[i].print && look.print ? 0 : 1));

  const printed = new THREE.MeshStandardMaterial({ color: "#ffffff", map: look.print, roughness: 0.85, side: THREE.DoubleSide });
  const plain = new THREE.MeshStandardMaterial({ color: look.color, roughness: 0.85, side: THREE.DoubleSide });
  const mesh = new THREE.SkinnedMesh(geometry, [printed, plain]);
  mesh.name = `garment-${kind}`;
  mesh.frustumCulled = false; // its bounds don't follow the bones
  mesh.add(root);
  mesh.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(BONES.map((name) => bones[name])));

  return {
    mesh,
    bones,
    dispose() {
      geometry.dispose();
      printed.dispose();
      plain.dispose();
      mesh.skeleton.dispose(); // the bone texture the renderer creates for every skinned mesh
    },
  };
}

/**
 * Poses a garment from a garment pose (in preview pixels; the scene's y points up, so y is flipped). Each bone
 * goes to its segment's start, turns to its angle, and stretches to its length; thickness follows the shoulder
 * width. With the hips out of view (seated), legs and skirt shrink to nothing.
 */
export function applyGarmentPose(garment: Garment, pose: GarmentPose): void {
  for (const name of BONES) {
    const target = pose.bones[name];
    const bone = garment.bones[name];
    bone.position.set(target.x, -target.y, 0);
    bone.rotation.set(0, name === "Spine" ? pose.turn : 0, target.angle);
    const hidden = !pose.legsInView && HIDE_WHEN_UNSEEN.has(name);
    const thickness = hidden ? 0 : pose.scale;
    bone.scale.set(thickness, hidden ? 0 : target.length / REST_LENGTHS[name], thickness);
  }
  garment.mesh.updateMatrixWorld(true);
}
