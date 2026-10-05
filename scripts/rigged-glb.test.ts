// @vitest-environment node
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { describe, expect, it } from "vitest";
import { fitGarmentModel } from "@/app/tryon/live/garmentModel";
import type { BoneTarget, GarmentPose } from "@/app/tryon/live/garmentPose";
import type { BoneName } from "@/app/tryon/live/skeleton";
import { checkGarmentModel } from "@/lib/garment-model";
import { riggedGarmentGlb } from "./rigged-glb";

// The fixture is real .glb bytes, so it goes through the real pipeline: the upload check (task 67), three.js's
// GLTFLoader, and Live 3D's posing (task 72).

const arrayBuffer = (bytes: Uint8Array) => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

describe("riggedGarmentGlb (test fixture)", () => {
  it.each(["UPPER", "LOWER", "OVERALL"] as const)("passes the admin upload check for a %s garment", (kind) => {
    expect(() => checkGarmentModel(riggedGarmentGlb(), kind)).not.toThrow();
    expect(() => checkGarmentModel(riggedGarmentGlb({ texture: true }), kind)).not.toThrow(); // texture inside the file
  });

  it("loads with three.js's GLTFLoader into a skinned mesh that Live 3D can pose", async () => {
    const gltf = await new GLTFLoader().parseAsync(arrayBuffer(riggedGarmentGlb()), "");
    const garment = fitGarmentModel(gltf.scene, "UPPER");
    const target = (x: number, y: number, angle: number): BoneTarget => ({ x, y, angle, length: 150, visible: true });
    const bones: Record<BoneName, BoneTarget> = {
      Spine: target(500, 600, 0),
      Hips: target(500, 600, Math.PI),
      LeftArm: target(600, 300, -1.2), // out to the screen's right, raised
      LeftForeArm: target(700, 250, Math.PI),
      RightArm: target(400, 300, Math.PI),
      RightForeArm: target(400, 450, Math.PI),
      LeftUpLeg: target(550, 600, Math.PI),
      LeftLeg: target(550, 820, Math.PI),
      RightUpLeg: target(450, 600, Math.PI),
      RightLeg: target(450, 820, Math.PI),
    };
    const pose: GarmentPose = { bones, scale: 200, turn: 0, legsInView: true, mirrored: false };
    garment.pose(pose);

    // GLTFLoader drops reserved characters such as ":" from node names, so "mixamorig:LeftArm" arrives as
    // "mixamorigLeftArm" (normalizeBoneName accepts the prefix with or without a separator).
    expect(gltf.scene.getObjectByName("mixamorig:LeftArm")).toBeUndefined();
    const at = (name: string) => (gltf.scene.getObjectByName(`mixamorig${name}`) as THREE.Object3D).getWorldPosition(new THREE.Vector3());
    const arm = at("LeftForeArm").sub(at("LeftArm")).normalize();
    expect(arm.x).toBeCloseTo(-Math.sin(-1.2), 3);
    expect(arm.y).toBeCloseTo(Math.cos(-1.2), 3);
    expect(garment.object.scale.x).toBeCloseTo(200 / 0.36); // sized by its 0.36 m shoulders
  });
});
