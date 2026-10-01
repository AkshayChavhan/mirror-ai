// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  ESTIMATED_TORSO_RATIO,
  LANDMARK,
  MIN_VISIBILITY,
  smoothPose,
  toBodyPose,
  toViewPoint,
  type BodyPose,
  type Landmark,
} from "./bodyPose";

// A person standing straight, facing the camera, as MediaPipe sees the UNMIRRORED camera image: their right
// shoulder is on the image's left (x 0.4), their left on the right (x 0.6).
const STANDING: Partial<Record<keyof typeof LANDMARK, [number, number]>> = {
  nose: [0.5, 0.15],
  rightShoulder: [0.4, 0.3],
  leftShoulder: [0.6, 0.3],
  rightElbow: [0.35, 0.45],
  leftElbow: [0.65, 0.45],
  rightWrist: [0.33, 0.58],
  leftWrist: [0.67, 0.58],
  rightHip: [0.43, 0.6],
  leftHip: [0.57, 0.6],
  rightKnee: [0.44, 0.78],
  leftKnee: [0.56, 0.78],
  rightAnkle: [0.44, 0.95],
  leftAnkle: [0.56, 0.95],
};

/** 33 landmarks (the unused ones at the center), with overrides by joint name. */
function landmarks(over: Partial<Record<keyof typeof LANDMARK, Partial<Landmark>>> = {}): Landmark[] {
  const points: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.99 }));
  for (const [name, [x, y]] of Object.entries(STANDING) as [keyof typeof LANDMARK, [number, number]][]) {
    points[LANDMARK[name]] = { x, y, z: 0, visibility: 0.99, ...over[name] };
  }
  return points;
}

const VIEW = { width: 1000, height: 1000, mirrored: true };

describe("toBodyPose", () => {
  it("places the joints in the mirrored preview's pixels: the person's left shoulder on the screen's left", () => {
    const pose = toBodyPose(landmarks(), undefined, VIEW);
    expect(pose?.joints.leftShoulder).toMatchObject({ x: 400, y: 300, visible: true });
    expect(pose?.joints.rightShoulder).toMatchObject({ x: 600, y: 300 });
    expect(pose?.shoulderCenter.x).toBeCloseTo(500); // toBeCloseTo: (1 − 0.57) × 1000 isn't exactly 430 in floating point
    expect(pose?.shoulderCenter.y).toBeCloseTo(300);
    expect(pose?.hipCenter.x).toBeCloseTo(500);
    expect(pose?.hipCenter.y).toBeCloseTo(600);
    expect(pose?.shoulderWidth).toBeCloseTo(200);
    expect(pose?.torsoHeight).toBeCloseTo(300);
    expect(pose?.roll).toBeCloseTo(0);
    expect(pose?.yaw).toBe(0); // no world landmarks
    expect(pose?.mirrored).toBe(true);
    expect(pose?.hipsEstimated).toBe(false);
  });

  it("estimates the hips straight below the shoulders when they're out of frame (e.g. seated at a laptop)", () => {
    const pose = toBodyPose(landmarks({ leftHip: { visibility: 0.1 }, rightHip: { visibility: 0.1 } }), undefined, VIEW);
    expect(pose?.hipsEstimated).toBe(true);
    expect(pose?.hipCenter.x).toBeCloseTo(500);
    expect(pose?.hipCenter.y).toBeCloseTo(300 + ESTIMATED_TORSO_RATIO * 200);
    expect(pose?.torsoHeight).toBeCloseTo(ESTIMATED_TORSO_RATIO * 200);
  });

  it("estimates hidden hips perpendicular to tilted shoulders, and also when only one hip is unclear", () => {
    const tilted = landmarks({ leftShoulder: { y: 0.25 }, rightShoulder: { y: 0.35 }, leftHip: { visibility: 0.1 } });
    const pose = toBodyPose(tilted, undefined, VIEW) as BodyPose;
    expect(pose.hipsEstimated).toBe(true);
    const down = { x: pose.hipCenter.x - pose.shoulderCenter.x, y: pose.hipCenter.y - pose.shoulderCenter.y };
    const across = { x: pose.joints.rightShoulder.x - pose.joints.leftShoulder.x, y: pose.joints.rightShoulder.y - pose.joints.leftShoulder.y };
    expect(down.x * across.x + down.y * across.y).toBeCloseTo(0); // at a right angle to the shoulder line
    expect(down.y).toBeGreaterThan(0); // below
  });

  it("keeps the camera's own left/right when the preview isn't mirrored", () => {
    const pose = toBodyPose(landmarks(), undefined, { ...VIEW, mirrored: false });
    expect(pose?.joints.leftShoulder.x).toBeCloseTo(600);
    expect(pose?.joints.rightShoulder.x).toBeCloseTo(400);
    expect(pose?.roll).toBeCloseTo(0);
  });

  it("measures the tilt of the shoulders on screen: positive when the screen-right shoulder is lower", () => {
    // The person's left shoulder is higher: in the mirror it's on the screen's left, so the screen-right is lower.
    const tilted = landmarks({ leftShoulder: { y: 0.25 }, rightShoulder: { y: 0.35 } });
    expect(toBodyPose(tilted, undefined, VIEW)?.roll).toBeCloseTo(Math.atan2(100, 200));
    // Unmirrored, that same shoulder is on the screen's right, so the screen-right is higher.
    expect(toBodyPose(tilted, undefined, { ...VIEW, mirrored: false })?.roll).toBeCloseTo(Math.atan2(-100, 200));
  });

  it("measures the turn from the world landmarks: positive when the left shoulder is farther away", () => {
    const world = landmarks({ leftShoulder: { x: 0.15, z: 0.1 }, rightShoulder: { x: -0.15, z: -0.1 } });
    expect(toBodyPose(landmarks(), world, VIEW)?.yaw).toBeCloseTo(Math.atan2(0.2, 0.3));
  });

  it("gives each joint its depth in metres from the world landmarks", () => {
    const world = landmarks({ leftWrist: { z: -0.4 } });
    expect(toBodyPose(landmarks(), world, VIEW)?.joints.leftWrist.depth).toBeCloseTo(-0.4);
  });

  it("marks an unsure elbow, wrist or leg joint as not visible, but still gives a pose", () => {
    const pose = toBodyPose(landmarks({ leftElbow: { visibility: MIN_VISIBILITY - 0.01 } }), undefined, VIEW);
    expect(pose?.joints.leftElbow.visible).toBe(false);
    expect(pose?.joints.rightElbow.visible).toBe(true);
  });

  it.each([
    ["fewer than 33 landmarks", landmarks().slice(0, 20), VIEW],
    ["a shoulder that isn't clearly visible", landmarks({ rightShoulder: { visibility: 0.2 } }), VIEW],
    ["someone too far away (shoulders under 4% of the width)", landmarks({ leftShoulder: { x: 0.51 }, rightShoulder: { x: 0.49 } }), VIEW],
    ["an empty view", landmarks(), { width: 0, height: 0, mirrored: true }],
  ])("gives no pose for %s", (_case, image, view) => {
    expect(toBodyPose(image, undefined, view)).toBeNull();
  });
});

describe("toViewPoint (the preview crops the video like CSS object-cover)", () => {
  // A 16:9 webcam (1280×720) shown in a 3:4 box (300×400): scaled ×0.556 to 711×400, then 205.6 px cut each side.
  const CROPPED = { width: 300, height: 400, mirrored: false, sourceWidth: 1280, sourceHeight: 720 };

  it("keeps the center in the center", () => {
    expect(toViewPoint(0.5, 0.5, CROPPED).x).toBeCloseTo(150);
    expect(toViewPoint(0.5, 0.5, CROPPED).y).toBeCloseTo(200);
  });

  it("scales and crops the sides (not a plain stretch to the box)", () => {
    const scale = 400 / 720;
    expect(toViewPoint(0.6, 0.25, CROPPED).x).toBeCloseTo(0.6 * 1280 * scale - (1280 * scale - 300) / 2);
    expect(toViewPoint(0.6, 0.25, CROPPED).y).toBeCloseTo(100);
  });

  it("mirrors around the view's center", () => {
    const plain = toViewPoint(0.6, 0.25, CROPPED).x;
    expect(toViewPoint(0.6, 0.25, { ...CROPPED, mirrored: true }).x).toBeCloseTo(300 - plain);
  });

  it("without a source size, maps straight to the view", () => {
    expect(toViewPoint(0.25, 0.75, { width: 1000, height: 1000, mirrored: false })).toEqual({ x: 250, y: 750 });
  });
});

describe("smoothPose", () => {
  const first = toBodyPose(landmarks(), undefined, VIEW) as BodyPose;
  const moved = toBodyPose(
    landmarks({ leftShoulder: { x: 0.5 }, leftElbow: { visibility: 0.1 } }), // left shoulder moves 100 px right on screen
    undefined,
    VIEW,
  ) as BodyPose;

  it("takes the new pose as is when there's no previous one", () => {
    expect(smoothPose(null, moved, 0.5)).toBe(moved);
  });

  it("moves each joint part of the way (alpha) and recomputes the sizes", () => {
    const smoothed = smoothPose(first, moved, 0.5);
    expect(smoothed.joints.leftShoulder.x).toBeCloseTo(450); // halfway from 400 to 500
    expect(smoothed.joints.rightShoulder.x).toBeCloseTo(600); // didn't move
    expect(smoothed.shoulderWidth).toBeCloseTo(150);
    expect(smoothed.shoulderCenter.x).toBeCloseTo(525);
  });

  it("with alpha 1, follows the new pose exactly", () => {
    expect(smoothPose(first, moved, 1).joints.leftShoulder.x).toBeCloseTo(500);
  });

  it("takes visibility from the new frame (a joint that disappears isn't kept as visible)", () => {
    expect(smoothPose(first, moved, 0.5).joints.leftElbow.visible).toBe(false);
  });

  it("smooths the turn too", () => {
    const turned = { ...moved, yaw: 0.4 };
    expect(smoothPose({ ...first, yaw: 0 }, turned, 0.5).yaw).toBeCloseTo(0.2);
  });

  it("never mixes a pose placed for a differently mirrored preview: takes the new one", () => {
    const unmirrored = toBodyPose(landmarks(), undefined, { ...VIEW, mirrored: false }) as BodyPose;
    expect(smoothPose(first, unmirrored, 0.5)).toBe(unmirrored);
  });
});
