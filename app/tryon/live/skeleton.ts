// The garment skeleton for Live 3D (task 65). Mixamo-style bone NAMES, so a garment rigged in Blender to a
// Mixamo skeleton (task 67's .glb uploads) can be matched bone by bone. Matching names isn't enough to pose
// it, though: Mixamo nests its bones and doesn't rest at the origin (and its "Hips" is the pelvis, pointing
// up), so task 67 needs to retarget from these targets to the uploaded skeleton's rest pose.

/** The bones a garment can use. Each one points along its body segment (its +Y axis, from start to end). */
export const BONES = [
  "Spine", // hips → shoulders (the torso)
  "Hips", // hips → knees (a skirt's direction)
  "LeftArm", // shoulder → elbow
  "LeftForeArm", // elbow → wrist
  "RightArm",
  "RightForeArm",
  "LeftUpLeg", // hip → knee
  "LeftLeg", // knee → ankle
  "RightUpLeg",
  "RightLeg",
] as const;

export type BoneName = (typeof BONES)[number];

/** A bone's name without a Mixamo prefix ("mixamorig:LeftArm", "mixamorig_LeftArm" and "mixamorigLeftArm" → "LeftArm"). */
export function normalizeBoneName(name: string): string {
  return name.replace(/^mixamorig[:_]?/i, "");
}

/** Whether `name` (from a .glb file) is one of our bones, with or without a Mixamo prefix. */
export function isGarmentBone(name: string): name is BoneName {
  return (BONES as readonly string[]).includes(normalizeBoneName(name));
}
