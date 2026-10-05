"use client";

import { useEffect, useRef, useState } from "react";

// Browser-only: the live camera with a pose guide (docs/project-plan.md, "/tryon"). The photo it takes goes
// through the same preview → Try on / Retake flow as a chosen file.

type Props = {
  /** A JPEG of exactly what was on screen (the 3:4 view) when "Take photo" was pressed. The camera is already off. */
  onCapture: (photo: File) => void;
  /** "Cancel" was pressed. The camera is already off. */
  onCancel: () => void;
};

const JPEG_QUALITY = 0.9;
/** The preview's shape (width / height), as in its `aspect-[3/4]` class. */
const VIEW_ASPECT = 3 / 4;
const CAPTURE_FAILED = "We couldn't take the photo. Try again, or choose a photo instead.";
/** The camera stopped by itself mid-session (task 69): unplugged, or access turned off in the browser. */
export const CAMERA_STOPPED =
  "Your camera stopped (was it unplugged, or was access turned off?). Cancel and try again, or choose a photo instead.";

/**
 * Calls `onStopped` once if a track of `stream` ends by itself (unplugged, access revoked, the device sleeps).
 * Its picture would freeze on the last frame. Browsers don't fire "ended" for our own track.stop() calls.
 */
export function whenCameraStops(stream: MediaStream, onStopped: () => void): void {
  for (const track of stream.getTracks()) track.addEventListener("ended", onStopped, { once: true });
}

/** What to tell the user when the camera can't start, from the error's name (getUserMedia's DOMExceptions). */
export function cameraErrorMessage(error: unknown): string {
  const name = error instanceof Error ? error.name : "";
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return "Camera access is blocked. Allow it for this site in your browser settings, or choose a photo instead.";
    case "NotFoundError":
    case "OverconstrainedError":
      return "No camera was found on this device. Choose a photo instead.";
    case "NotReadableError":
      return "Another app is using the camera. Close it and try again, or choose a photo instead.";
    default:
      return "We couldn't start your camera. Cancel and try again, or choose a photo instead.";
  }
}

/**
 * The centered part of a width×height frame that fills a view of `aspect` (width / height), like CSS
 * `object-cover`: what the preview actually shows. Source rectangle for canvas drawImage.
 */
export function coverCrop(width: number, height: number, aspect = VIEW_ASPECT) {
  if (width / height > aspect) {
    const sw = Math.round(height * aspect); // wider than the view: trim the sides
    return { sx: Math.round((width - sw) / 2), sy: 0, sw, sh: height };
  }
  const sh = Math.round(width / aspect); // taller than the view: trim top and bottom
  return { sx: 0, sy: Math.round((height - sh) / 2), sw: width, sh };
}

function stopCamera(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop()); // turns the camera light off
}

export default function CameraCapture({ onCapture, onCancel }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [startError, setStartError] = useState<string | null>(null); // the camera isn't on: Take photo can't work
  const [captureError, setCaptureError] = useState<string | null>(null); // the camera is on: Take photo can be retried

  // Start the front camera once; always stop it when this closes (capture, cancel, or leaving the page).
  useEffect(() => {
    let closed = false;
    cancelRef.current?.focus(); // keyboard users land inside the camera view, on a button that always works
    (async () => {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 1080 }, height: { ideal: 1440 } },
          audio: false,
        });
      } catch (cameraError) {
        if (!closed) setStartError(cameraErrorMessage(cameraError));
        return;
      }
      if (closed) return stopCamera(stream); // closed while the browser was asking for permission
      streamRef.current = stream;
      whenCameraStops(stream, () => {
        if (closed) return;
        stopCamera(stream);
        streamRef.current = null; // a photo being made right now is dropped: it could be the frozen frame
        setStartError(CAMERA_STOPPED); // the camera isn't on any more: Take photo is disabled
      });
      try {
        const video = videoRef.current;
        if (!video) throw new Error("The camera view is gone.");
        video.srcObject = stream;
        await video.play();
        if (!closed) setReady(true);
      } catch {
        // Permission was granted, but the picture can't be shown: don't leave the camera running.
        stopCamera(stream);
        streamRef.current = null;
        // Keep an earlier message: if the camera stopped by itself first, that's the real problem (task 69).
        if (!closed) setStartError((earlier) => earlier ?? "We couldn't show your camera. Cancel and try again, or choose a photo instead.");
      }
    })();
    return () => {
      closed = true;
      stopCamera(streamRef.current);
      streamRef.current = null;
    };
  }, []);

  function close(): void {
    stopCamera(streamRef.current);
    streamRef.current = null;
  }

  function takePhoto(): void {
    const video = videoRef.current;
    if (!video || !video.videoWidth || capturing) return;
    setCaptureError(null);
    // Only what the preview shows (object-cover crops the frame to 3:4), so the photo matches the pose guide.
    const { sx, sy, sw, sh } = coverCrop(video.videoWidth, video.videoHeight);
    const canvas = document.createElement("canvas");
    canvas.width = sw;
    canvas.height = sh;
    const context = canvas.getContext("2d");
    if (!context) return setCaptureError(CAPTURE_FAILED);
    // The preview is mirrored like a mirror; the photo isn't, so text on a shirt reads the right way round.
    context.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);
    setCapturing(true);
    canvas.toBlob(
      (blob) => {
        setCapturing(false);
        if (!streamRef.current) return; // cancelled (or closed) while the photo was being made
        if (!blob) return setCaptureError(CAPTURE_FAILED);
        close();
        onCapture(new File([blob], "camera.jpg", { type: "image/jpeg" }));
      },
      "image/jpeg",
      JPEG_QUALITY,
    );
  }

  function cancel(): void {
    close();
    onCancel();
  }

  const error = startError ?? captureError;
  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-[3/4] w-full max-w-sm overflow-hidden rounded-lg bg-zinc-900">
        <video
          ref={videoRef}
          aria-label="Camera preview"
          playsInline // iPhone: play inside the page, not full screen
          muted
          className="h-full w-full -scale-x-100 object-cover"
        />
        {/* The pose guide: stand so your body fills this outline. Decorative for screen readers (the text below says it). */}
        <svg
          viewBox="0 0 300 400"
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full"
          fill="none"
          stroke="white"
          strokeWidth="3"
          strokeDasharray="10 8"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.85"
        >
          <circle cx="150" cy="70" r="32" />
          <path d="M150 102v14M100 128c14-8 30-12 50-12s36 4 50 12l18 92M100 128l-18 92M112 150v108l8 122M188 150v108l-8 122M112 258h76" />
        </svg>
      </div>

      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Stand back until your body fits the outline, facing the camera.
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
          disabled={!ready || startError !== null || capturing}
          className="rounded bg-black px-5 py-3 text-white disabled:opacity-50 dark:bg-white dark:text-black"
        >
          {ready || startError ? "Take photo" : "Starting camera…"}
        </button>
        <button ref={cancelRef} type="button" onClick={cancel} className="underline">
          Cancel
        </button>
      </div>
    </div>
  );
}
