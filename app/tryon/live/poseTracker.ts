"use client";

import type { PoseLandmarker } from "@mediapipe/tasks-vision";
import type { Landmark } from "./bodyPose";

// Browser-only: body tracking on the device with MediaPipe's Pose Landmarker (task 64). Camera frames are
// processed right here and never leave the device. The model and WASM are served by our own app (public/).

/** Where scripts/copy-mediapipe-wasm.mts puts the WASM files (git-ignored copies from node_modules). */
export const MEDIAPIPE_WASM_PATH = "/mediapipe/wasm";
/** The "lite" model (5.8 MB, fastest), committed at a pinned version. */
export const POSE_MODEL_PATH = "/mediapipe/pose_landmarker_lite.task";

/** One tracked person: landmarks in the image (0..1) and in the world (metres, origin between the hips). */
export type TrackedPose = { image: Landmark[]; world: Landmark[] | undefined };

export type PoseTracker = {
  /** Tracks the video's current frame. Null when no person is found. */
  detect(video: HTMLVideoElement, timeMs: number): TrackedPose | null;
  /** Frees the model (and its GPU memory). */
  close(): void;
};

/**
 * Loads MediaPipe (only when Live 3D is opened: it's a separate chunk) and the pose model. Uses the GPU when
 * the browser allows it, otherwise the CPU. Throws if neither works; the caller shows a friendly message.
 */
export async function createPoseTracker(): Promise<PoseTracker> {
  const { FilesetResolver, PoseLandmarker } = await import("@mediapipe/tasks-vision");
  const fileset = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_PATH);
  const create = (delegate: "GPU" | "CPU") =>
    PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: POSE_MODEL_PATH, delegate },
      runningMode: "VIDEO",
      numPoses: 1, // the person trying the garment on
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

  let landmarker: PoseLandmarker;
  try {
    landmarker = await create("GPU");
  } catch (gpuError) {
    console.warn("[live] Body tracking on the GPU failed; trying the CPU.", gpuError);
    landmarker = await create("CPU");
  }

  let lastTime = -1;
  let closed = false;
  return {
    detect(video, timeMs) {
      if (closed) return null; // a late animation frame after close() must not touch the freed model
      // MediaPipe needs strictly increasing timestamps (two frames can share one clock reading).
      const time = timeMs > lastTime ? timeMs : lastTime + 1;
      lastTime = time;
      const result = landmarker.detectForVideo(video, time);
      const image = result.landmarks[0];
      return image && image.length > 0 ? { image, world: result.worldLandmarks[0] } : null;
    },
    close() {
      if (closed) return; // safe to call twice
      closed = true;
      landmarker.close();
    },
  };
}
