// @vitest-environment node
import { describe, expect, it } from "vitest";
import { LANDMARK, toBodyPose, type BodyPose, type Landmark } from "./bodyPose";
import { FOREARM_RATIO, THIGH_RATIO, UPPER_ARM_RATIO, segmentAngle, segmentEnd, toGarmentPose } from "./garmentPose";

// A person standing straight, facing the camera (unmirrored image coordinates), as in bodyPose.test.ts.
const STANDING: Record<keyof typeof LANDMARK, [number, number]> = {
  nose: [0.5, 0.15],
  rightShoulder: [0.4, 0.3],
  leftShoulder: [0.6, 0.3],
  rightElbow: [0.38, 0.45],
  leftElbow: [0.62, 0.45],
  rightWrist: [0.38, 0.58],
  leftWrist: [0.62, 0.58],
  rightHip: [0.43, 0.6],
  leftHip: [0.57, 0.6],
  rightKnee: [0.43, 0.78],
  leftKnee: [0.57, 0.78],
  rightAnkle: [0.43, 0.95],
  leftAnkle: [0.57, 0.95],
};

function pose(over: Partial<Record<keyof typeof LANDMARK, Partial<Landmark>>> = {}): BodyPose {
  const points: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.99 }));
  for (const [name, [x, y]] of Object.entries(STANDING) as [keyof typeof LANDMARK, [number, number]][]) {
    points[LANDMARK[name]] = { x, y, z: 0, visibility: 0.99, ...over[name] };
  }
  return toBodyPose(points, undefined, { width: 1000, height: 1000, mirrored: true }) as BodyPose;
}

describe("segmentAngle / segmentEnd (y grows down on screen, up in the 3D scene)", () => {
  it.each([
    ["up the screen", { x: 0, y: -10 }, 0],
    ["right", { x: 10, y: 0 }, -Math.PI / 2],
    ["left", { x: -10, y: 0 }, Math.PI / 2],
  ])("pointing %s", (_case, to, angle) => {
    expect(segmentAngle({ x: 0, y: 0 }, to)).toBeCloseTo(angle);
  });

  it("pointing down the screen is a half turn", () => {
    expect(Math.abs(segmentAngle({ x: 0, y: 0 }, { x: 0, y: 10 }))).toBeCloseTo(Math.PI);
  });

  it("segmentEnd undoes segmentAngle", () => {
    const from = { x: 120, y: 80 };
    const to = { x: 200, y: 260 };
    const end = segmentEnd(from, segmentAngle(from, to), Math.hypot(80, 180));
    expect(end.x).toBeCloseTo(200);
    expect(end.y).toBeCloseTo(260);
  });
});

describe("toGarmentPose", () => {
  it("runs the torso (Spine) from the hips up to the shoulders, one shoulder width per unit", () => {
    const body = pose();
    const garment = toGarmentPose(body);
    expect(garment.scale).toBeCloseTo(200);
    expect(garment.bones.Spine).toMatchObject({ angle: expect.closeTo(0), visible: true });
    expect(garment.bones.Spine.x).toBeCloseTo(500);
    expect(garment.bones.Spine.y).toBeCloseTo(600);
    expect(garment.bones.Spine.length).toBeCloseTo(300);
  });

  it("points each arm from the shoulder to the elbow, and each forearm from the elbow to the wrist", () => {
    const { bones } = toGarmentPose(pose());
    // Mirrored: the person's left shoulder is on the screen's left, at x 400; the elbow at x 380, 150 px lower.
    expect(bones.LeftArm.x).toBeCloseTo(400);
    expect(bones.LeftArm.angle).toBeCloseTo(segmentAngle({ x: 400, y: 300 }, { x: 380, y: 450 }));
    expect(bones.LeftArm.length).toBeCloseTo(Math.hypot(20, 150));
    expect(bones.LeftForeArm.x).toBeCloseTo(380);
    expect(bones.LeftForeArm.y).toBeCloseTo(450);
    expect(bones.LeftForeArm.length).toBeCloseTo(130);
    expect(bones.LeftForeArm.visible).toBe(true);
  });

  it("hangs an arm whose elbow is out of view straight down along the body, at an average length", () => {
    const { bones, scale } = toGarmentPose(pose({ rightElbow: { visibility: 0.1 } }));
    expect(Math.abs(bones.RightArm.angle)).toBeCloseTo(Math.PI); // down
    expect(bones.RightArm.length).toBeCloseTo(UPPER_ARM_RATIO * scale);
    expect(bones.RightArm.visible).toBe(false);
    expect(bones.RightForeArm.length).toBeCloseTo(FOREARM_RATIO * scale);
    expect(bones.RightForeArm.y).toBeCloseTo(300 + UPPER_ARM_RATIO * scale); // starts where the hanging arm ends
  });

  it("runs the legs from the hips to the knees and ankles, and the skirt (Hips) towards the knees", () => {
    const { bones } = toGarmentPose(pose());
    expect(bones.LeftUpLeg).toMatchObject({ visible: true, length: expect.closeTo(180) });
    expect(bones.LeftLeg).toMatchObject({ visible: true, length: expect.closeTo(170) });
    expect(Math.abs(bones.Hips.angle)).toBeCloseTo(Math.PI); // straight down to the knees' midpoint
    expect(bones.Hips.visible).toBe(true);
  });

  it("with the hips out of view (seated), marks legs and skirt as not visible", () => {
    const { bones, scale } = toGarmentPose(pose({ leftHip: { visibility: 0.1 }, rightHip: { visibility: 0.1 } }));
    for (const name of ["Hips", "LeftUpLeg", "LeftLeg", "RightUpLeg", "RightLeg"] as const) {
      expect(bones[name].visible).toBe(false);
    }
    expect(bones.LeftUpLeg.length).toBeCloseTo(THIGH_RATIO * scale);
    expect(bones.Spine.visible).toBe(true); // a Top still shows
    expect(toGarmentPose(pose({ leftHip: { visibility: 0.1 } })).legsInView).toBe(false);
  });

  it("turns the torso the body's way: the yaw is flipped for a mirrored preview (left shoulder on the screen's left)", () => {
    expect(toGarmentPose({ ...pose(), yaw: 0.3 }).turn).toBeCloseTo(-0.3); // the fixture's preview is mirrored
    expect(toGarmentPose({ ...pose(), yaw: 0.3, mirrored: false }).turn).toBeCloseTo(0.3);
  });

  it("with the hips in view but a knee below the frame, the thigh hangs straight down (still part of the garment)", () => {
    const garment = toGarmentPose(pose({ leftKnee: { visibility: 0.1 }, leftAnkle: { visibility: 0.1 } }));
    expect(garment.legsInView).toBe(true);
    expect(Math.abs(garment.bones.LeftUpLeg.angle)).toBeCloseTo(Math.PI);
    expect(garment.bones.LeftUpLeg.length).toBeCloseTo(THIGH_RATIO * garment.scale);
    expect(garment.bones.LeftUpLeg.visible).toBe(false); // estimated, not seen
  });
});
