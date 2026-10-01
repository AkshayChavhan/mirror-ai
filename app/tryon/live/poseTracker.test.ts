import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// MediaPipe is replaced by a fake: no WASM, model or camera is loaded in unit tests.
const m = vi.hoisted(() => ({
  forVisionTasks: vi.fn(),
  createFromOptions: vi.fn(),
  detectForVideo: vi.fn(),
  close: vi.fn(),
}));
vi.mock("@mediapipe/tasks-vision", () => ({
  FilesetResolver: { forVisionTasks: m.forVisionTasks },
  PoseLandmarker: { createFromOptions: m.createFromOptions },
}));

import { MEDIAPIPE_WASM_PATH, POSE_MODEL_PATH, createPoseTracker } from "./poseTracker";

const FILESET = { wasmLoaderPath: "x", wasmBinaryPath: "y" };
const landmarker = { detectForVideo: m.detectForVideo, close: m.close };
const video = document.createElement("video");
const point = { x: 0.5, y: 0.5, z: 0, visibility: 1 };

describe("createPoseTracker", () => {
  beforeEach(() => {
    m.forVisionTasks.mockResolvedValue(FILESET);
    m.createFromOptions.mockResolvedValue(landmarker);
    m.detectForVideo.mockReturnValue({ landmarks: [], worldLandmarks: [] });
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("loads the WASM and the model from our own app, for video, one person, on the GPU", async () => {
    await createPoseTracker();
    expect(m.forVisionTasks).toHaveBeenCalledWith(MEDIAPIPE_WASM_PATH);
    expect(MEDIAPIPE_WASM_PATH).toBe("/mediapipe/wasm");
    expect(m.createFromOptions).toHaveBeenCalledWith(FILESET, {
      baseOptions: { modelAssetPath: POSE_MODEL_PATH, delegate: "GPU" },
      runningMode: "VIDEO",
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
  });

  it("falls back to the CPU when the GPU can't be used, and says so in the console", async () => {
    const gpuError = new Error("WebGL2 unavailable");
    m.createFromOptions.mockRejectedValueOnce(gpuError).mockResolvedValueOnce(landmarker);
    await expect(createPoseTracker()).resolves.toBeDefined();
    expect(m.createFromOptions).toHaveBeenLastCalledWith(
      FILESET,
      expect.objectContaining({ baseOptions: expect.objectContaining({ delegate: "CPU" }) }),
    );
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("trying the CPU"), gpuError);
  });

  it("throws when neither the GPU nor the CPU works (the caller shows a friendly message)", async () => {
    m.createFromOptions.mockRejectedValue(new Error("no"));
    await expect(createPoseTracker()).rejects.toThrow("no");
  });

  it("returns the first person's image and world landmarks", async () => {
    const image = Array.from({ length: 33 }, () => point);
    const world = Array.from({ length: 33 }, () => ({ ...point, z: -0.1 }));
    m.detectForVideo.mockReturnValue({ landmarks: [image], worldLandmarks: [world] });
    const tracker = await createPoseTracker();
    expect(tracker.detect(video, 100)).toEqual({ image, world });
    expect(m.detectForVideo).toHaveBeenCalledWith(video, 100);
  });

  it("returns null when nobody is in the frame", async () => {
    const tracker = await createPoseTracker();
    expect(tracker.detect(video, 100)).toBeNull();
  });

  it("always gives MediaPipe a later timestamp than the last one (it rejects repeats)", async () => {
    const tracker = await createPoseTracker();
    tracker.detect(video, 100);
    tracker.detect(video, 100); // the same clock reading twice
    tracker.detect(video, 50); // or an earlier one
    tracker.detect(video, 200);
    expect(m.detectForVideo.mock.calls.map(([, time]) => time)).toEqual([100, 101, 102, 200]);
  });

  it("close() frees the model once; calling it twice is safe", async () => {
    const tracker = await createPoseTracker();
    tracker.close();
    tracker.close();
    expect(m.close).toHaveBeenCalledTimes(1);
  });

  it("after close(), detect returns null without touching the freed model (a late animation frame)", async () => {
    const tracker = await createPoseTracker();
    tracker.close();
    expect(tracker.detect(video, 100)).toBeNull();
    expect(m.detectForVideo).not.toHaveBeenCalled();
  });
});
