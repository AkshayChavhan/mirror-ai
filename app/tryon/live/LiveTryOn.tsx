"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { CAMERA_STOPPED, cameraErrorMessage, coverCrop, whenCameraStops } from "../CameraCapture";
import { smoothPose, toBodyPose, type BodyPose } from "./bodyPose";
import { loadGarmentLook } from "./garmentLook";
import { loadGarmentModel, type LiveGarment } from "./garmentModel";
import { toGarmentPose } from "./garmentPose";
import { applyGarmentPose, buildGarment, type GarmentKind } from "./garmentTemplates";
import { createLiveScene, type LiveScene } from "./liveScene";
import { createPoseTracker, type PoseTracker } from "./poseTracker";

// Live 3D try-on (task 66): the front camera with a 3D garment that follows the body, all on the device.
// Body tracking (MediaPipe, task 64) → body pose → garment pose → the 3D garment, every frame: the garment's
// uploaded model (task 72) when it has one, else (or if the model can't be used) the built-in template (task 65).
// "Take photo" captures the camera (without the overlay) for the realistic AI try-on, like CameraCapture.

export type LiveProduct = { name: string; imageUrl: string; category: GarmentKind; modelUrl: string | null };

type Props = {
  product: LiveProduct;
  /** A JPEG of the 3:4 view (no 3D overlay). Live 3D has already stopped. */
  onCapture: (photo: File) => void;
  onCancel: () => void;
};

/** How much of each new frame's pose to take: lower is steadier, higher follows faster. */
export const SMOOTHING = 0.5;
const JPEG_QUALITY = 0.9;
const NOT_AVAILABLE = "Live 3D isn't available on this device. You can still take or choose a photo.";

type Phase = "starting" | "running" | "error";

/** The garment's uploaded model, or null (after a warning) when it can't be loaded or used: then the template shows. */
async function loadUsableModel(url: string, kind: GarmentKind): Promise<LiveGarment | null> {
  try {
    return await loadGarmentModel(url, kind);
  } catch (modelError) {
    console.warn("[live] The garment's 3D model couldn't be used; showing the built-in shape.", modelError);
    return null;
  }
}

export default function LiveTryOn({ product, onCapture, onCancel }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [phase, setPhase] = useState<Phase>("starting");
  const [error, setError] = useState<string | null>(null);
  const [bodySeen, setBodySeen] = useState(false);
  const [garmentSource, setGarmentSource] = useState<"model" | "template" | null>(null); // which garment is drawn

  useEffect(() => {
    let closed = false;
    let failed = false; // the first failure's message stays (e.g. the camera stopping while MediaPipe loads)
    let frame = 0;
    let tracker: PoseTracker | null = null;
    let garment: LiveGarment | null = null;
    let texture: THREE.Texture | null = null;
    let scene: LiveScene | null = null;
    let smoothed: BodyPose | null = null;
    cancelRef.current?.focus();

    /** The built-in template, coloured and printed from the product photo (task 65). */
    const templateGarment = (kind: GarmentKind, look: Awaited<ReturnType<typeof loadGarmentLook>>): LiveGarment => {
      if (look.print) {
        texture = new THREE.CanvasTexture(look.print);
        texture.colorSpace = THREE.SRGBColorSpace; // the photo's colors as they are
      }
      const template = buildGarment(kind, { color: look.color, print: texture });
      return { object: template.mesh, pose: (pose) => applyGarmentPose(template, pose), dispose: () => template.dispose() };
    };

    const stopCamera = () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
    const fail = (message: string) => {
      if (closed || failed) return;
      failed = true;
      stopCamera();
      tracker?.close(); // nothing will use it now
      tracker = null;
      setError(message);
      setPhase("error");
    };

    (async () => {
      // 1. The camera (same request as CameraCapture: front camera, video only).
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 1080 }, height: { ideal: 1440 } },
          audio: false,
        });
      } catch (cameraError) {
        return fail(cameraErrorMessage(cameraError));
      }
      if (closed) return stream.getTracks().forEach((track) => track.stop());
      streamRef.current = stream;
      whenCameraStops(stream, () => fail(CAMERA_STOPPED)); // task 69: stops the tracker and disables Take photo

      // 2. The tracker, the garment's look and the 3D scene. Any failure: Live 3D isn't available here.
      try {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas) throw new Error("The Live 3D view is gone.");
        video.srcObject = stream;
        await video.play();
        // The model loads alongside (it never rejects: a failure gives null). If the tracker or look fails
        // first, a model that arrives afterwards is freed: nothing will use it.
        const modelLoad = product.modelUrl ? loadUsableModel(product.modelUrl, product.category) : Promise.resolve(null);
        const [loadedTracker, look] = await Promise.all([createPoseTracker(), loadGarmentLook(product.imageUrl)]).catch(
          (setupError: unknown) => {
            void modelLoad.then((late) => late?.dispose());
            throw setupError;
          },
        );
        const model = await modelLoad;
        // Closed or failed while loading (e.g. the camera stopped): nothing will use the tracker or model.
        if (closed || failed) {
          model?.dispose();
          return loadedTracker.close();
        }
        tracker = loadedTracker;
        garment = model ?? templateGarment(product.category, look);
        setGarmentSource(model ? "model" : "template");
        garment.object.visible = false; // until a body is found
        scene = createLiveScene(canvas, garment.object);
      } catch (liveError) {
        console.warn("[live] Live 3D couldn't start.", liveError);
        return fail(NOT_AVAILABLE);
      }

      // 3. Every frame: track, pose the garment, draw.
      setPhase("running");
      const render = () => {
        if (closed || !tracker || !garment || !scene) return;
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (video && canvas && video.videoWidth > 0) {
          const view = {
            width: canvas.clientWidth,
            height: canvas.clientHeight,
            mirrored: true, // like the preview (a mirror)
            sourceWidth: video.videoWidth,
            sourceHeight: video.videoHeight,
          };
          scene.resize(view.width, view.height, window.devicePixelRatio || 1);
          const tracked = tracker.detect(video, performance.now());
          const pose = tracked ? toBodyPose(tracked.image, tracked.world, view) : null;
          smoothed = pose ? smoothPose(smoothed, pose, SMOOTHING) : null;
          if (smoothed) garment.pose(toGarmentPose(smoothed));
          garment.object.visible = smoothed !== null;
          setBodySeen(smoothed !== null); // React skips the re-render when it's unchanged
          scene.render();
        }
        frame = requestAnimationFrame(render);
      };
      frame = requestAnimationFrame(render);
    })();

    return () => {
      closed = true;
      setGarmentSource(null); // a new product shows no stale "model"/"template" until its garment is ready
      cancelAnimationFrame(frame);
      stopCamera();
      tracker?.close();
      garment?.dispose();
      texture?.dispose();
      scene?.dispose();
    };
  }, [product.imageUrl, product.category, product.modelUrl]);

  function takePhoto(): void {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const { sx, sy, sw, sh } = coverCrop(video.videoWidth, video.videoHeight);
    const canvas = document.createElement("canvas");
    canvas.width = sw;
    canvas.height = sh;
    const context = canvas.getContext("2d");
    if (!context) return setError("We couldn't take the photo. Try again, or choose a photo instead.");
    context.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh); // the camera only, not the 3D garment
    canvas.toBlob(
      (blob) => {
        if (!streamRef.current) return; // closed while the photo was being made
        if (!blob) return setError("We couldn't take the photo. Try again, or choose a photo instead.");
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        onCapture(new File([blob], "camera.jpg", { type: "image/jpeg" }));
      },
      "image/jpeg",
      JPEG_QUALITY,
    );
  }

  const status =
    phase === "starting"
      ? "Starting Live 3D…"
      : phase === "running"
        ? bodySeen
          ? `Move around: the ${product.name} follows you.`
          : "Step back until we can see your shoulders."
        : "";

  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-[3/4] w-full max-w-sm overflow-hidden rounded-lg bg-zinc-900">
        <video ref={videoRef} aria-label="Live 3D camera" playsInline muted className="h-full w-full -scale-x-100 object-cover" />
        {/* The 3D garment, drawn in the mirrored preview's pixels (the pose math already mirrors). */}
        <canvas
          ref={canvasRef}
          aria-hidden="true"
          data-garment={garmentSource ?? undefined} // "model" (uploaded) or "template": for tests and debugging
          className="pointer-events-none absolute inset-0 h-full w-full"
        />
      </div>
      <p role="status" className="text-sm text-zinc-600 dark:text-zinc-400">
        {status}
      </p>
      {error && (
        <p role="alert" className="text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={takePhoto}
          disabled={phase !== "running"}
          className="rounded bg-black px-5 py-3 text-white disabled:opacity-50 dark:bg-white dark:text-black"
        >
          Take photo
        </button>
        <button
          ref={cancelRef}
          type="button"
          onClick={() => {
            streamRef.current?.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
            onCancel();
          }}
          className="underline"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
