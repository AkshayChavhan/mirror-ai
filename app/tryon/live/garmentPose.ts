import type { BodyPose } from "./bodyPose";
import type { BoneName } from "./skeleton";

// Pure math for Live 3D (task 65): a body pose (task 64) → where each garment bone goes on screen. No
// three.js here, so it's fully unit-tested; garmentTemplates.ts applies the result to the 3D bones.

type Point = { x: number; y: number };

/** One bone on screen: it starts at (x, y) in preview pixels and points `angle` for `length` pixels. */
export type BoneTarget = Point & {
  /** Radians, the scene's convention: 0 points up the screen, positive turns counter-clockwise (as rotation.z). */
  angle: number;
  length: number;
  /** False when that body part isn't in view (and the target is only an estimate): the garment can hide it. */
  visible: boolean;
};

export type GarmentPose = {
  bones: Record<BoneName, BoneTarget>;
  /** Pixels per template unit: one unit is one shoulder width. */
  scale: number;
  /**
   * The torso's turn in the 3D scene (radians, as rotation.y): positive brings the screen-left shoulder
   * towards the camera. It's the body's yaw, flipped for a mirrored preview (where the person's left
   * shoulder is on the screen's left).
   */
  turn: number;
  /** False when the hips are only estimated (seated): legs and skirt are then left out. */
  legsInView: boolean;
  /**
   * True for a mirrored preview: the person's left side is on the screen's left. An uploaded model (task 72)
   * faces the camera, so there its RIGHT side follows the person's left, keeping prints readable like the
   * templates.
   */
  mirrored: boolean;
};

// Body proportions in shoulder widths, for parts that are out of view (an average adult).
export const UPPER_ARM_RATIO = 0.75;
export const FOREARM_RATIO = 0.7;
export const THIGH_RATIO = 1.1;
export const SHIN_RATIO = 1.05;

/** The angle that turns a bone's +Y (up in the 3D scene) to point from `from` to `to` on screen (y grows down). */
export function segmentAngle(from: Point, to: Point): number {
  return Math.atan2(-(to.x - from.x), -(to.y - from.y));
}

/** Where a bone ends: `length` pixels from `from`, in direction `angle` (the inverse of segmentAngle). */
export function segmentEnd(from: Point, angle: number, length: number): Point {
  return { x: from.x - Math.sin(angle) * length, y: from.y - Math.cos(angle) * length };
}

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** A bone from `start` to `end` when `end` is visible, else hanging in `fallbackAngle` for `fallbackLength`. */
function bone(start: Point, end: { x: number; y: number; visible: boolean }, fallbackAngle: number, fallbackLength: number, visible: boolean): BoneTarget {
  return end.visible
    ? { x: start.x, y: start.y, angle: segmentAngle(start, end), length: distance(start, end), visible }
    : { x: start.x, y: start.y, angle: fallbackAngle, length: fallbackLength, visible: false };
}

/** The garment bones for a body pose. Arms and legs out of view hang straight down along the body. */
export function toGarmentPose(pose: BodyPose): GarmentPose {
  const { joints: j, shoulderWidth: scale, hipCenter, shoulderCenter, hipsEstimated } = pose;
  const up = segmentAngle(hipCenter, shoulderCenter); // the torso's direction
  const down = up + Math.PI; // along the body, towards the feet

  const leftArm = bone(j.leftShoulder, j.leftElbow, down, UPPER_ARM_RATIO * scale, true);
  const rightArm = bone(j.rightShoulder, j.rightElbow, down, UPPER_ARM_RATIO * scale, true);
  const leftElbow = segmentEnd(j.leftShoulder, leftArm.angle, leftArm.length);
  const rightElbow = segmentEnd(j.rightShoulder, rightArm.angle, rightArm.length);

  // Legs only exist when the hips are really in view (not estimated from the shoulders). A knee out of view
  // (e.g. below a webcam's frame) makes the thigh hang straight down, like an arm.
  const legs = !hipsEstimated;
  const leftUpLeg = bone(j.leftHip, legs ? j.leftKnee : { ...j.leftKnee, visible: false }, down, THIGH_RATIO * scale, legs);
  const rightUpLeg = bone(j.rightHip, legs ? j.rightKnee : { ...j.rightKnee, visible: false }, down, THIGH_RATIO * scale, legs);
  const leftKnee = segmentEnd(j.leftHip, leftUpLeg.angle, leftUpLeg.length);
  const rightKnee = segmentEnd(j.rightHip, rightUpLeg.angle, rightUpLeg.length);
  const kneeCenter = { x: (leftKnee.x + rightKnee.x) / 2, y: (leftKnee.y + rightKnee.y) / 2 };

  return {
    scale,
    turn: pose.mirrored ? -pose.yaw : pose.yaw,
    legsInView: legs,
    mirrored: pose.mirrored,
    bones: {
      Spine: { ...hipCenter, angle: up, length: pose.torsoHeight, visible: true },
      Hips: { ...hipCenter, angle: segmentAngle(hipCenter, kneeCenter), length: distance(hipCenter, kneeCenter), visible: legs },
      LeftArm: leftArm,
      RightArm: rightArm,
      LeftForeArm: bone(leftElbow, j.leftElbow.visible ? j.leftWrist : { ...j.leftWrist, visible: false }, leftArm.angle, FOREARM_RATIO * scale, j.leftElbow.visible),
      RightForeArm: bone(rightElbow, j.rightElbow.visible ? j.rightWrist : { ...j.rightWrist, visible: false }, rightArm.angle, FOREARM_RATIO * scale, j.rightElbow.visible),
      LeftUpLeg: leftUpLeg,
      RightUpLeg: rightUpLeg,
      LeftLeg: bone(leftKnee, legs && leftUpLeg.visible ? j.leftAnkle : { ...j.leftAnkle, visible: false }, leftUpLeg.angle, SHIN_RATIO * scale, legs && leftUpLeg.visible),
      RightLeg: bone(rightKnee, legs && rightUpLeg.visible ? j.rightAnkle : { ...j.rightAnkle, visible: false }, rightUpLeg.angle, SHIN_RATIO * scale, legs && rightUpLeg.visible),
    },
  };
}
