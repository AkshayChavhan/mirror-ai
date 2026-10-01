// @vitest-environment node
import { describe, expect, it } from "vitest";
import { BONES, isGarmentBone, normalizeBoneName } from "./skeleton";

describe("the garment skeleton", () => {
  it("uses Mixamo's names for torso, arms and legs", () => {
    expect(BONES).toEqual([
      "Spine", "Hips", "LeftArm", "LeftForeArm", "RightArm", "RightForeArm", "LeftUpLeg", "LeftLeg", "RightUpLeg", "RightLeg",
    ]);
  });

  it.each([
    ["mixamorig:LeftArm", "LeftArm"],
    ["mixamorig_LeftArm", "LeftArm"],
    ["mixamorigLeftArm", "LeftArm"],
    ["MixamoRig:Spine", "Spine"],
    ["LeftArm", "LeftArm"],
  ])("reads %s as %s", (name, expected) => {
    expect(normalizeBoneName(name)).toBe(expected);
  });

  it("recognises our bones with or without the Mixamo prefix, and nothing else", () => {
    expect(isGarmentBone("mixamorig:RightUpLeg")).toBe(true);
    expect(isGarmentBone("Hips")).toBe(true);
    expect(isGarmentBone("mixamorig:Head")).toBe(false);
    expect(isGarmentBone("Spine2")).toBe(false);
  });
});
