// @vitest-environment node
import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { LANDMARK, toBodyPose, type BodyPose, type Landmark } from "./bodyPose";
import { segmentEnd, toGarmentPose } from "./garmentPose";
import { REST_LENGTHS, TEMPLATES, applyGarmentPose, buildGarment, type GarmentKind } from "./garmentTemplates";
import { BONES, type BoneName } from "./skeleton";

// three.js builds and poses meshes without a GPU, so these tests check real (skinned) vertex positions.
const PRINT = new THREE.Texture();
const LOOK = { color: "#ff0000", print: PRINT };

const STANDING: Record<keyof typeof LANDMARK, [number, number]> = {
  nose: [0.5, 0.15], rightShoulder: [0.4, 0.3], leftShoulder: [0.6, 0.3], rightElbow: [0.38, 0.45], leftElbow: [0.62, 0.45],
  rightWrist: [0.38, 0.58], leftWrist: [0.62, 0.58], rightHip: [0.43, 0.6], leftHip: [0.57, 0.6], rightKnee: [0.43, 0.78],
  leftKnee: [0.57, 0.78], rightAnkle: [0.43, 0.95], leftAnkle: [0.57, 0.95],
};
function body(over: Partial<Record<keyof typeof LANDMARK, Partial<Landmark>>> = {}): BodyPose {
  const points: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.99 }));
  for (const [name, [x, y]] of Object.entries(STANDING) as [keyof typeof LANDMARK, [number, number]][]) {
    points[LANDMARK[name]] = { x, y, z: 0, visibility: 0.99, ...over[name] };
  }
  return toBodyPose(points, undefined, { width: 1000, height: 1000, mirrored: true }) as BodyPose;
}

/** The bone indices a garment's vertices are skinned to. */
function bonesUsed(mesh: THREE.SkinnedMesh): BoneName[] {
  const skin = mesh.geometry.getAttribute("skinIndex");
  const used = new Set<number>();
  for (let i = 0; i < skin.count; i++) used.add(skin.getX(i));
  return [...used].sort((a, b) => a - b).map((i) => BONES[i]);
}

/** The average posed (skinned) position of a part's vertices at bind height y. */
function postedRingCenter(mesh: THREE.SkinnedMesh, bone: BoneName, y: number): THREE.Vector3 {
  const position = mesh.geometry.getAttribute("position");
  const skin = mesh.geometry.getAttribute("skinIndex");
  const sum = new THREE.Vector3();
  let n = 0;
  for (let i = 0; i < position.count; i++) {
    if (skin.getX(i) !== BONES.indexOf(bone) || Math.abs(position.getY(i) - y) > 1e-6) continue;
    sum.add(mesh.applyBoneTransform(i, new THREE.Vector3().fromBufferAttribute(position, i)));
    n += 1;
  }
  return sum.divideScalar(n);
}

describe("buildGarment", () => {
  it("builds a skinned mesh with the 10 Mixamo-style bones, a printed and a plain material", () => {
    const { mesh } = buildGarment("UPPER", LOOK);
    expect(mesh).toBeInstanceOf(THREE.SkinnedMesh);
    expect(mesh.skeleton.bones.map((b) => b.name)).toEqual([...BONES]);
    const [printed, plain] = mesh.material as THREE.MeshStandardMaterial[];
    expect(printed.map).toBe(PRINT);
    expect(plain.color.getHexString()).toBe("ff0000");
  });

  it.each([
    ["UPPER", ["Spine", "LeftArm", "RightArm"], [0, 1, 1]],
    ["LOWER", ["Spine", "LeftUpLeg", "LeftLeg", "RightUpLeg", "RightLeg"], [1, 1, 1, 1, 1]],
    ["OVERALL", ["Spine", "Hips"], [0, 1]],
  ] as const)("%s: uses its own bones, with the print only on the body", (kind, bones, materials) => {
    const { mesh } = buildGarment(kind as GarmentKind, LOOK);
    expect(bonesUsed(mesh)).toEqual([...bones].sort((a, b) => BONES.indexOf(a) - BONES.indexOf(b)));
    expect(mesh.geometry.groups.map((g) => g.materialIndex)).toEqual(materials);
    expect(TEMPLATES[kind as GarmentKind]).toHaveLength(bones.length);
  });

  it("without a print (the photo couldn't be read), the whole garment is the plain color", () => {
    const { mesh } = buildGarment("UPPER", { color: "#336699", print: null });
    expect(mesh.geometry.groups.every((g) => g.materialIndex === 1)).toBe(true);
  });

  it("dispose() frees the geometry, both materials and the skeleton (its GPU bone texture)", () => {
    const garment = buildGarment("OVERALL", LOOK);
    const geometry = vi.spyOn(garment.mesh.geometry, "dispose");
    const materials = (garment.mesh.material as THREE.Material[]).map((m) => vi.spyOn(m, "dispose"));
    const skeleton = vi.spyOn(garment.mesh.skeleton, "dispose");
    garment.dispose();
    expect(geometry).toHaveBeenCalled();
    materials.forEach((spy) => expect(spy).toHaveBeenCalled());
    expect(skeleton).toHaveBeenCalled();
  });
});

describe("applyGarmentPose", () => {
  it("moves, turns and stretches each bone to its segment (screen y flipped), thickness = shoulder width", () => {
    const garment = buildGarment("UPPER", LOOK);
    const pose = { ...toGarmentPose(body()), turn: 0.25 };
    applyGarmentPose(garment, pose);
    const arm = garment.bones.LeftArm;
    expect(arm.position.toArray()).toEqual([pose.bones.LeftArm.x, -pose.bones.LeftArm.y, 0]);
    expect(arm.rotation.z).toBeCloseTo(pose.bones.LeftArm.angle);
    expect(arm.scale.y).toBeCloseTo(pose.bones.LeftArm.length / REST_LENGTHS.LeftArm);
    expect(arm.scale.x).toBeCloseTo(200);
    expect(garment.bones.Spine.rotation.y).toBeCloseTo(0.25); // only the torso turns
    expect(arm.rotation.y).toBe(0);
  });

  it("puts the sleeve's end on the line from the shoulder to the elbow (a real skinned vertex check)", () => {
    const garment = buildGarment("UPPER", LOOK);
    const pose = toGarmentPose(body());
    applyGarmentPose(garment, pose);
    const { x, y, angle, length } = pose.bones.LeftArm;
    const sleeveEnd = TEMPLATES.UPPER[1].to; // the sleeve reaches this far along a rest-length arm
    const expected = segmentEnd({ x, y }, angle, (sleeveEnd / REST_LENGTHS.LeftArm) * length);
    const center = postedRingCenter(garment.mesh, "LeftArm", sleeveEnd);
    expect(center.x).toBeCloseTo(expected.x, 3);
    expect(center.y).toBeCloseTo(-expected.y, 3);
  });

  it("runs the body from the hips to just above the shoulder line (the neckline)", () => {
    const garment = buildGarment("UPPER", LOOK);
    const pose = toGarmentPose(body());
    applyGarmentPose(garment, pose);
    const torsoTop = TEMPLATES.UPPER[0].to; // a little past the rest length: above the shoulders
    const top = postedRingCenter(garment.mesh, "Spine", torsoTop);
    expect(top.x).toBeCloseTo(500, 3);
    expect(top.y).toBeCloseTo(-(600 - (torsoTop / REST_LENGTHS.Spine) * 300), 3); // hips at y 600, shoulders 300 above
    expect(-top.y).toBeLessThan(300); // above the shoulder line on screen
  });

  it("turns the body the person's way: its front moves to the side of the shoulder coming towards the camera", () => {
    const frontX = (mirrored: boolean) => {
      const garment = buildGarment("UPPER", LOOK);
      const base = body();
      applyGarmentPose(garment, toGarmentPose({ ...base, mirrored, yaw: 0.5 })); // the person's left shoulder farther away
      const position = garment.mesh.geometry.getAttribute("position");
      const skin = garment.mesh.geometry.getAttribute("skinIndex");
      for (let i = 0; i < position.count; i++) {
        // The body's front center: x 0, toward the camera (+z), at its middle height.
        if (skin.getX(i) === BONES.indexOf("Spine") && Math.abs(position.getX(i)) < 1e-6 && position.getZ(i) > 0 && position.getY(i) > 0.6) {
          return garment.mesh.applyBoneTransform(i, new THREE.Vector3().fromBufferAttribute(position, i)).x;
        }
      }
      throw new Error("no front-center vertex");
    };
    // Mirrored: the person's left shoulder is on the screen's left and goes away, so the front faces screen-left.
    expect(frontX(true)).toBeLessThan(500);
    // Unmirrored: that shoulder is on the screen's right, so the front faces screen-right.
    expect(frontX(false)).toBeGreaterThan(500);
  });

  it("keeps a thigh (hanging down) when the hips are in view but the knee is below the frame", () => {
    const lower = buildGarment("LOWER", LOOK);
    applyGarmentPose(lower, toGarmentPose(body({ leftKnee: { visibility: 0.1 }, leftAnkle: { visibility: 0.1 } })));
    expect(lower.bones.LeftUpLeg.scale.x).toBeCloseTo(200);
    expect(lower.bones.LeftLeg.scale.x).toBeCloseTo(200);
  });

  it("shrinks trousers' legs to nothing when the hips aren't in view (seated), but keeps sleeves", () => {
    const lower = buildGarment("LOWER", LOOK);
    applyGarmentPose(lower, toGarmentPose(body({ leftHip: { visibility: 0.1 }, rightHip: { visibility: 0.1 } })));
    expect(lower.bones.LeftUpLeg.scale.toArray()).toEqual([0, 0, 0]);
    const knee = postedRingCenter(lower.mesh, "LeftUpLeg", TEMPLATES.LOWER[1].to);
    expect(knee.distanceTo(lower.bones.LeftUpLeg.position)).toBeCloseTo(0);

    const upper = buildGarment("UPPER", LOOK);
    applyGarmentPose(upper, toGarmentPose(body({ leftElbow: { visibility: 0.1 } })));
    expect(upper.bones.LeftArm.scale.x).toBeCloseTo(200); // an arm out of view still has its sleeve
  });
});
