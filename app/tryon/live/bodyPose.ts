// Pure math for Live 3D (task 64): MediaPipe's 33 pose landmarks → the joints a garment needs, in screen
// pixels of the (mirrored, cropped) camera preview. No browser APIs, so it's fully unit-tested.
// Landmark indices: https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker ("Pose landmarker model").

/** MediaPipe pose landmark indices for the joints we use. "left" is the PERSON's left. */
export const LANDMARK = {
  nose: 0,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
} as const;

export type JointName = keyof typeof LANDMARK;
const JOINT_NAMES = Object.keys(LANDMARK) as JointName[];

/** One MediaPipe landmark: x/y normalized to 0..1 of the image (or metres, for world landmarks). */
export type Landmark = { x: number; y: number; z: number; visibility?: number };

/** A joint on screen: pixels in the preview, plus its depth in metres (from the world landmarks, 0 if unknown). */
export type Joint = { x: number; y: number; depth: number; visible: boolean };

export type BodyPose = {
  joints: Record<JointName, Joint>;
  /** Whether x was flipped for a mirrored preview (kept here, so smoothing can't mix the two). */
  mirrored: boolean;
  shoulderCenter: { x: number; y: number };
  hipCenter: { x: number; y: number };
  /** True when the hips weren't visible (e.g. seated at a laptop) and hipCenter is estimated from the shoulders. */
  hipsEstimated: boolean;
  /** Distance between the shoulders, in pixels: the garment's scale. */
  shoulderWidth: number;
  /** From the shoulder center to the hip center, in pixels. */
  torsoHeight: number;
  /** Tilt of the shoulder line on screen, in radians: 0 is level, positive when the screen-right shoulder is lower. */
  roll: number;
  /** Turn, in radians: 0 facing the camera, positive when the person's left shoulder is farther away. */
  yaw: number;
};

/**
 * The preview the joints are placed in. `sourceWidth`/`sourceHeight` are the video's own size: when its shape
 * differs from the view's, the preview crops it like CSS `object-cover` (centered), and so does the mapping.
 */
export type View = { width: number; height: number; mirrored: boolean; sourceWidth?: number; sourceHeight?: number };

/** Below this, MediaPipe isn't sure a landmark is really visible (0..1). */
export const MIN_VISIBILITY = 0.5;
/** Shoulders closer than this share of the view width: too far away (or side-on) to fit a garment. */
export const MIN_SHOULDER_SHARE = 0.04;
/** Hips hidden: the torso is taken as this many shoulder widths long (an average adult's proportion). */
export const ESTIMATED_TORSO_RATIO = 1.35;

const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const midpoint = (a: { x: number; y: number }, b: { x: number; y: number }) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/** Where a normalized point (0..1 of the video) appears in the view: object-cover crop, then the mirror. */
export function toViewPoint(u: number, v: number, view: View): { x: number; y: number } {
  const sourceWidth = view.sourceWidth || view.width;
  const sourceHeight = view.sourceHeight || view.height;
  const scale = Math.max(view.width / sourceWidth, view.height / sourceHeight); // cover: fill, then crop the rest
  const offsetX = (sourceWidth * scale - view.width) / 2;
  const offsetY = (sourceHeight * scale - view.height) / 2;
  // Mirroring the cropped picture around its center is the same as mirroring u before cropping.
  return { x: (view.mirrored ? 1 - u : u) * sourceWidth * scale - offsetX, y: v * sourceHeight * scale - offsetY };
}

/** Centers, sizes and angles from the joints (shared by toBodyPose and smoothPose). */
function derive(joints: Record<JointName, Joint>, mirrored: boolean, yaw: number): BodyPose {
  const { leftShoulder, rightShoulder, leftHip, rightHip } = joints;
  // In a mirrored preview the person's left shoulder is on the screen's left, like in a mirror.
  const [screenLeft, screenRight] = mirrored ? [leftShoulder, rightShoulder] : [rightShoulder, leftShoulder];
  const shoulderCenter = midpoint(leftShoulder, rightShoulder);
  const shoulderWidth = distance(leftShoulder, rightShoulder);
  const roll = Math.atan2(screenRight.y - screenLeft.y, screenRight.x - screenLeft.x);
  const hipsEstimated = !(leftHip.visible && rightHip.visible);
  // Hidden hips: straight "down" from the shoulders, perpendicular to the (tilted) shoulder line.
  const torso = ESTIMATED_TORSO_RATIO * shoulderWidth;
  const hipCenter = hipsEstimated
    ? { x: shoulderCenter.x - Math.sin(roll) * torso, y: shoulderCenter.y + Math.cos(roll) * torso }
    : midpoint(leftHip, rightHip);
  return {
    joints,
    mirrored,
    shoulderCenter,
    hipCenter,
    hipsEstimated,
    shoulderWidth,
    torsoHeight: distance(shoulderCenter, hipCenter),
    roll,
    yaw,
  };
}

/**
 * The body pose for one camera frame, or null when there's no usable body: too few landmarks, the shoulders
 * not clearly visible, or too far away. Hidden hips are fine (estimated). `world` (metres) gives depth and turn.
 */
export function toBodyPose(image: Landmark[], world: Landmark[] | undefined, view: View): BodyPose | null {
  if (image.length < 33 || view.width <= 0 || view.height <= 0) return null;

  const joints = {} as Record<JointName, Joint>;
  for (const name of JOINT_NAMES) {
    const point = image[LANDMARK[name]];
    joints[name] = {
      ...toViewPoint(point.x, point.y, view),
      depth: world?.[LANDMARK[name]]?.z ?? 0,
      visible: (point.visibility ?? 1) >= MIN_VISIBILITY,
    };
  }
  if (!joints.leftShoulder.visible || !joints.rightShoulder.visible) return null;

  const left = world?.[LANDMARK.leftShoulder];
  const right = world?.[LANDMARK.rightShoulder];
  // Seen from above, the shoulder line turns away from the camera: depth difference against width.
  const yaw = left && right ? Math.atan2(left.z - right.z, Math.abs(left.x - right.x)) : 0;

  const pose = derive(joints, view.mirrored, yaw);
  return pose.shoulderWidth < MIN_SHOULDER_SHARE * view.width ? null : pose;
}

/**
 * Evens out the jitter between frames: each joint moves `alpha` of the way to its new place (1 = no smoothing,
 * smaller = steadier but slower). Visibility always comes from the new frame. No previous pose, or one placed
 * for a differently mirrored preview: the new one as is.
 */
export function smoothPose(previous: BodyPose | null, next: BodyPose, alpha: number): BodyPose {
  if (!previous || previous.mirrored !== next.mirrored) return next;
  const mix = (a: number, b: number) => a + (b - a) * alpha;
  const joints = {} as Record<JointName, Joint>;
  for (const name of JOINT_NAMES) {
    const a = previous.joints[name];
    const b = next.joints[name];
    joints[name] = { x: mix(a.x, b.x), y: mix(a.y, b.y), depth: mix(a.depth, b.depth), visible: b.visible };
  }
  return derive(joints, next.mirrored, mix(previous.yaw, next.yaw));
}
