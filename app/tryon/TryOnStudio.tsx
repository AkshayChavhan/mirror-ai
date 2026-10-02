"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useActionState, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createTryOnAction, type TryOnFormState } from "./actions";
import CameraCapture from "./CameraCapture";
import type { GarmentKind } from "./live/garmentTemplates";
import { shrinkPhoto } from "./shrinkPhoto";
import { useTryOnStatus, type TryOnProgress } from "./useTryOnStatus";

// Live 3D (task 66) loads only when it's opened: three.js and MediaPipe are big, and most visits don't need them.
const LiveTryOn = dynamic(() => import("./live/LiveTryOn"), {
  ssr: false,
  loading: () => <p className="text-sm text-zinc-600 dark:text-zinc-400">Loading Live 3D…</p>,
});

export type StudioProduct = { id: string; name: string; imageUrl: string; category: GarmentKind };

type Props = {
  products: StudioProduct[];
  initialProductId: string;
  /** A try-on already started (from ?tryon=<id> after a refresh): the loading screen shows it straight away. */
  initialTryOnId?: string | null;
};

type ChosenPhoto = { file: File; previewUrl: string };

const INITIAL: TryOnFormState = { error: null, tryOnId: null };

// Whether this browser can use a camera: only known in the browser (the server render says no), and it
// needs a secure page (https or localhost).
const noSubscribe = () => () => {};
const browserHasCamera = () => Boolean(navigator.mediaDevices?.getUserMedia);
const serverHasCamera = () => false;

/** The loading screen's line, read out by screen readers. Empty when there's nothing to say there. */
function progressText(progress: TryOnProgress | null): string {
  if (progress?.kind === "done") return "Your try-on is ready. Opening it…";
  if (progress?.kind !== "waiting") return "";
  const text = progress.status === "PENDING" ? "Waiting to start…" : "Creating your try-on… This can take a minute.";
  return progress.slow ? `${text} It's taking longer than usual.` : text;
}

/** The current address with ?tryon= set (or removed), so a refresh keeps (or drops) the loading screen. */
function urlWithTryOn(tryOnId: string | null): string {
  const url = new URL(window.location.href);
  if (tryOnId) url.searchParams.set("tryon", tryOnId);
  else url.searchParams.delete("tryon");
  return `${url.pathname}${url.search}`;
}

/** Pick a garment, take or choose a photo, check the preview, then Try on (or Retake), then wait for it. */
export default function TryOnStudio({ products, initialProductId, initialTryOnId = null }: Props) {
  const [productId, setProductId] = useState(initialProductId);
  const [photo, setPhoto] = useState<ChosenPhoto | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [liveOpen, setLiveOpen] = useState(false);
  const canUseCamera = useSyncExternalStore(noSubscribe, browserHasCamera, serverHasCamera);
  // When the camera closes or Try again is pressed, those buttons disappear: move focus to the photo step's
  // heading, not the page top.
  const photoHeadingRef = useRef<HTMLHeadingElement>(null);
  const refocusPhotoStep = useRef(false);
  const [state, formAction, pending] = useActionState(createTryOnAction, INITIAL);
  const router = useRouter();

  // The try-on being watched: the one in the address until this page starts one, then the one just started
  // (none if starting it failed, never the address one again). "Try again" dismisses it.
  const [dismissedId, setDismissedId] = useState<string | null>(null);
  const watchedId = state === INITIAL ? initialTryOnId : state.error === null ? state.tryOnId : null;
  const activeId = watchedId && watchedId !== dismissedId ? watchedId : null;
  const progress = useTryOnStatus(activeId);
  const started = activeId !== null;

  // Keep ?tryon=<id> in the address while watching (native history API: no reload, Next's router keeps up).
  useEffect(() => {
    const next = urlWithTryOn(activeId);
    if (next !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(null, "", next);
  }, [activeId]);

  // Done: open the result page (slider, download, WhatsApp share), REPLACING this history entry. With push,
  // Back would reopen /tryon?tryon=<id>, whose first poll says DONE again and sends the user forward again.
  useEffect(() => {
    if (progress?.kind === "done") router.replace(`/tryon/${encodeURIComponent(progress.shareId)}`);
  }, [progress, router]);

  useEffect(() => {
    if (!cameraOpen && !liveOpen && refocusPhotoStep.current) {
      refocusPhotoStep.current = false;
      photoHeadingRef.current?.focus();
    }
  }, [cameraOpen, liveOpen, activeId]);

  function closeCamera() {
    refocusPhotoStep.current = true;
    setCameraOpen(false);
  }

  function closeLive() {
    refocusPhotoStep.current = true;
    setLiveOpen(false);
  }

  function tryAgain() {
    refocusPhotoStep.current = true;
    setDismissedId(activeId);
  }

  // Free the preview's memory when it's replaced or the page closes.
  useEffect(() => () => {
    if (photo) URL.revokeObjectURL(photo.previewUrl);
  }, [photo]);

  /** A chosen or camera photo: shrink it (and drop its metadata), then show the preview. */
  async function preparePhoto(file: File) {
    setPhotoError(null);
    setPreparing(true);
    try {
      const small = await shrinkPhoto(file);
      setPhoto({ file: small, previewUrl: URL.createObjectURL(small) });
    } catch {
      setPhotoError("We couldn't read that photo. Please choose a JPEG, PNG or WebP image.");
    } finally {
      setPreparing(false);
    }
  }

  async function onChoose(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // choosing the same file again still fires a change
    if (file) await preparePhoto(file);
  }

  async function onCapture(file: File) {
    closeCamera();
    await preparePhoto(file);
  }

  /** "Take photo" in Live 3D: the same preview → Try on flow as the camera (both modes kept). */
  async function onLiveCapture(file: File) {
    closeLive();
    await preparePhoto(file);
  }

  function onTryOn() {
    if (!photo) return;
    const formData = new FormData();
    formData.set("productId", productId);
    formData.set("photo", photo.file);
    startTransition(() => formAction(formData)); // an action called outside a <form> must run in a transition
  }

  const selected = products.find((p) => p.id === productId);
  const stopped = progress?.kind === "failed" || progress?.kind === "lost" ? progress : null;

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="garment-heading" className="flex flex-col gap-3">
        <h2 id="garment-heading" className="text-lg font-medium">
          1. Pick a garment
        </h2>
        <ul className="flex gap-3 overflow-x-auto pb-2">
          {products.map((product) => (
            <li key={product.id} className="shrink-0">
              <button
                type="button"
                aria-pressed={product.id === productId}
                onClick={() => setProductId(product.id)}
                disabled={pending || started}
                className="flex w-28 flex-col gap-1 rounded-lg border-2 border-zinc-200 p-1 text-left text-sm disabled:opacity-60 aria-pressed:border-black dark:border-zinc-800 dark:aria-pressed:border-white"
              >
                <span className="relative block aspect-[3/4] w-full overflow-hidden rounded bg-zinc-100 dark:bg-zinc-900">
                  <Image src={product.imageUrl} alt="" fill sizes="112px" className="object-contain" />
                </span>
                {product.name}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="photo-heading" className="flex flex-col gap-3">
        <h2 id="photo-heading" ref={photoHeadingRef} tabIndex={-1} className="text-lg font-medium focus:outline-none">
          2. Add a photo of yourself
        </h2>
        {liveOpen && selected ? (
          <LiveTryOn product={selected} onCapture={onLiveCapture} onCancel={closeLive} />
        ) : cameraOpen ? (
          <CameraCapture onCapture={onCapture} onCancel={closeCamera} />
        ) : photo ? (
          // The user's own photo, from their device: a blob: URL, so a plain <img> (next/image can't optimize it).
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo.previewUrl} alt="Your photo" className="max-h-96 w-auto self-start rounded-lg" />
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            {canUseCamera && (
              <button
                type="button"
                onClick={() => setCameraOpen(true)}
                disabled={preparing || started}
                className="rounded bg-black px-4 py-2 text-white disabled:opacity-50 dark:bg-white dark:text-black"
              >
                Use camera
              </button>
            )}
            {canUseCamera && (
              <button
                type="button"
                onClick={() => setLiveOpen(true)}
                disabled={preparing || started}
                className="rounded border border-black px-4 py-2 disabled:opacity-50 dark:border-white"
              >
                Live 3D
              </button>
            )}
            <label className="rounded border px-4 py-2 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-black dark:has-[:focus-visible]:ring-white">
              {preparing ? "Preparing your photo…" : "Choose a photo"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={onChoose}
                disabled={preparing || started}
                className="sr-only"
              />
            </label>
          </div>
        )}
        {photoError && (
          <p role="alert" className="text-red-600 dark:text-red-400">
            {photoError}
          </p>
        )}
      </section>

      {photo && (
        <div className="flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={onTryOn}
            disabled={pending || started}
            className="rounded bg-black px-5 py-3 text-white disabled:opacity-50 dark:bg-white dark:text-black"
          >
            {pending ? "Starting…" : `Try on ${selected?.name ?? "this garment"}`}
          </button>
          <button type="button" onClick={() => setPhoto(null)} disabled={pending || started} className="underline disabled:opacity-50">
            Retake
          </button>
        </div>
      )}

      {state.error && (
        <p role="alert" className="text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}

      {/* The loading screen (task 43). The status line is always in the page, so screen readers announce it. */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          {started && !stopped && (
            <span
              aria-hidden="true"
              className="size-5 shrink-0 animate-spin rounded-full border-2 border-zinc-300 border-t-black motion-reduce:animate-none dark:border-zinc-700 dark:border-t-white"
            />
          )}
          <p role="status" className="text-zinc-700 dark:text-zinc-300">
            {started ? progressText(progress) : ""}
          </p>
        </div>
        {progress?.kind === "waiting" && progress.slow && (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            You can leave this page: your try-on will be in{" "}
            <Link href="/history" className="underline">
              your history
            </Link>{" "}
            when it&apos;s ready.
          </p>
        )}
        {stopped && (
          <div className="flex flex-col items-start gap-3">
            <p role="alert" className="text-red-600 dark:text-red-400">
              {stopped.message}
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={tryAgain}
                className="rounded bg-black px-5 py-3 text-white dark:bg-white dark:text-black"
              >
                Try again
              </button>
              {stopped.kind === "lost" && (
                <Link href="/history" className="underline">
                  Go to your history
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
