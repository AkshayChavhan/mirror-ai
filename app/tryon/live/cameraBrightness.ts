// Live 3D (task 74): how bright the camera image is, so the 3D garment's lighting can follow the room. A garment
// lit the same in a dim room as in daylight looks pasted on. The math is pure (unit-tested); sampling a video
// frame is the small browser-only part.

/** The camera frame is shrunk to this many pixels a side before measuring: cheap, and enough for an average. */
export const SAMPLE_SIZE = 16;
/** Measure about twice a second (at ~30 frames a second). */
export const SAMPLE_EVERY_FRAMES = 15;
/** The camera brightness (0–1) at which the garment keeps its normal lighting. */
export const NEUTRAL_LUMINANCE = 0.45;
/** How far the garment's lighting may follow the room: never darker than half, never brighter than 1.3×. */
export const BRIGHTNESS_RANGE = { min: 0.5, max: 1.3 } as const;
/** How much of each new measurement to take, so the lighting changes smoothly instead of flickering. */
export const BRIGHTNESS_EASE = 0.25;

/** The average brightness (0–1) of RGBA pixels, weighting red, green and blue as the eye does (Rec. 709). */
export function averageLuminance(rgba: ArrayLike<number>): number {
  const pixels = Math.floor(rgba.length / 4);
  if (pixels === 0) return 0;
  let sum = 0;
  for (let p = 0; p < pixels; p++) sum += 0.2126 * rgba[p * 4] + 0.7152 * rgba[p * 4 + 1] + 0.0722 * rgba[p * 4 + 2];
  return sum / pixels / 255;
}

/** The garment's light multiplier for a camera brightness: 1 at NEUTRAL_LUMINANCE, within BRIGHTNESS_RANGE. */
export function brightnessFactor(luminance: number): number {
  return Math.min(BRIGHTNESS_RANGE.max, Math.max(BRIGHTNESS_RANGE.min, luminance / NEUTRAL_LUMINANCE));
}

/** One smoothing step from `current` towards `target`. */
export function easeToward(current: number, target: number, amount = BRIGHTNESS_EASE): number {
  return current + (target - current) * amount;
}

/**
 * Browser-only: the current camera frame's average brightness, drawn small into `context` (a SAMPLE_SIZE ×
 * SAMPLE_SIZE canvas). Null if the frame can't be read; the lighting then simply stays as it is.
 */
export function sampleCameraBrightness(video: HTMLVideoElement, context: CanvasRenderingContext2D): number | null {
  try {
    context.drawImage(video, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
    return averageLuminance(context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data);
  } catch {
    return null;
  }
}
