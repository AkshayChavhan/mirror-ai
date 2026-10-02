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

/** WebGL drawn by software, with no real GPU (e.g. Chrome's SwiftShader, Linux's llvmpipe). */
const SOFTWARE_RENDERER = /swiftshader|llvmpipe|softpipe|software|basic render/i;

/**
 * Where MediaPipe should run: the GPU, unless the browser's WebGL is software only. There its GPU path is
 * emulated on the CPU and freezes the page (22–60 s for the first frame, then ~0.5 s a frame, measured in
 * headless Chrome), while its own CPU path runs at video speed. Unknown renderer (null): try the GPU.
 */
export function preferredDelegate(renderer: string | null): "GPU" | "CPU" {
  return renderer !== null && SOFTWARE_RENDERER.test(renderer) ? "CPU" : "GPU";
}

/** The name of the browser's WebGL renderer, or null when WebGL (or the name) isn't available. */
function webglRendererName(): string | null {
  try {
    const gl = document.createElement("canvas").getContext("webgl2");
    const info = gl?.getExtension("WEBGL_debug_renderer_info");
    const name: unknown = gl && info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : null;
    gl?.getExtension("WEBGL_lose_context")?.loseContext(); // browsers allow only a few live contexts
    return typeof name === "string" ? name : null;
  } catch {
    return null;
  }
}

/**
 * Loads MediaPipe (only when Live 3D is opened: it's a separate chunk) and the pose model. Uses the GPU when
 * the browser has a real one, otherwise the CPU. Throws if neither works; the caller shows a friendly message.
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
  if (preferredDelegate(webglRendererName()) === "CPU") {
    landmarker = await create("CPU");
  } else {
    try {
      landmarker = await create("GPU");
    } catch (gpuError) {
      console.warn("[live] Body tracking on the GPU failed; trying the CPU.", gpuError);
      landmarker = await create("CPU");
    }
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
