// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  BRIGHTNESS_RANGE,
  NEUTRAL_LUMINANCE,
  SAMPLE_SIZE,
  averageLuminance,
  brightnessFactor,
  easeToward,
  sampleCameraBrightness,
} from "./cameraBrightness";

const pixels = (...rgb: [number, number, number][]) => rgb.flatMap(([r, g, b]) => [r, g, b, 255]);

describe("averageLuminance", () => {
  it("is 0 for black, 1 for white, and in between for grey", () => {
    expect(averageLuminance(pixels([0, 0, 0]))).toBe(0);
    expect(averageLuminance(pixels([255, 255, 255]))).toBeCloseTo(1);
    expect(averageLuminance(pixels([128, 128, 128]))).toBeCloseTo(128 / 255);
  });

  it("weights green most and blue least, as the eye does", () => {
    expect(averageLuminance(pixels([0, 255, 0]))).toBeGreaterThan(averageLuminance(pixels([255, 0, 0])));
    expect(averageLuminance(pixels([255, 0, 0]))).toBeGreaterThan(averageLuminance(pixels([0, 0, 255])));
  });

  it("averages all the pixels, and is 0 for none", () => {
    expect(averageLuminance(pixels([0, 0, 0], [255, 255, 255]))).toBeCloseTo(0.5);
    expect(averageLuminance([])).toBe(0);
  });
});

describe("brightnessFactor", () => {
  it("keeps the normal lighting for a normally lit room", () => {
    expect(brightnessFactor(NEUTRAL_LUMINANCE)).toBeCloseTo(1);
  });

  it("dims the garment in a dim room and brightens it in a bright one, within limits", () => {
    expect(brightnessFactor(0.3)).toBeLessThan(1);
    expect(brightnessFactor(0.55)).toBeGreaterThan(1);
    expect(brightnessFactor(0)).toBe(BRIGHTNESS_RANGE.min); // a black frame never makes it vanish
    expect(brightnessFactor(1)).toBe(BRIGHTNESS_RANGE.max);
  });
});

describe("easeToward", () => {
  it("moves part of the way each time, so the light changes smoothly", () => {
    expect(easeToward(1, 0.5, 0.25)).toBeCloseTo(0.875);
    let value = 1;
    for (let i = 0; i < 40; i++) value = easeToward(value, 0.5);
    expect(value).toBeCloseTo(0.5, 3); // and gets there
  });
});

describe("sampleCameraBrightness", () => {
  const video = {} as HTMLVideoElement;

  it("draws the frame small and averages it", () => {
    const grey = new Uint8ClampedArray(SAMPLE_SIZE * SAMPLE_SIZE * 4).fill(128);
    const context = { drawImage: vi.fn(), getImageData: vi.fn(() => ({ data: grey })) } as unknown as CanvasRenderingContext2D;
    expect(sampleCameraBrightness(video, context)).toBeCloseTo(128 / 255);
    expect(context.drawImage).toHaveBeenCalledWith(video, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
  });

  it("gives null when the frame can't be read (the lighting then stays as it is)", () => {
    const context = {
      drawImage: vi.fn(),
      getImageData: vi.fn(() => {
        throw new Error("The canvas has been tainted");
      }),
    } as unknown as CanvasRenderingContext2D;
    expect(sampleCameraBrightness(video, context)).toBeNull();
  });
});
