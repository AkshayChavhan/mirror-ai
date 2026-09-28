"use client";

import Image from "next/image";
import { startTransition, useActionState, useEffect, useState } from "react";
import { createTryOnAction, type TryOnFormState } from "./actions";
import { shrinkPhoto } from "./shrinkPhoto";

export type StudioProduct = { id: string; name: string; imageUrl: string };

type Props = { products: StudioProduct[]; initialProductId: string };

type ChosenPhoto = { file: File; previewUrl: string };

const INITIAL: TryOnFormState = { error: null, tryOnId: null };

/** Pick a garment, choose a photo, check the preview, then Try on (or Retake). */
export default function TryOnStudio({ products, initialProductId }: Props) {
  const [productId, setProductId] = useState(initialProductId);
  const [photo, setPhoto] = useState<ChosenPhoto | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [state, formAction, pending] = useActionState(createTryOnAction, INITIAL);

  // Free the preview's memory when it's replaced or the page closes.
  useEffect(() => () => {
    if (photo) URL.revokeObjectURL(photo.previewUrl);
  }, [photo]);

  async function onChoose(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // choosing the same file again still fires a change
    if (!file) return;
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

  function onTryOn() {
    if (!photo) return;
    const formData = new FormData();
    formData.set("productId", productId);
    formData.set("photo", photo.file);
    startTransition(() => formAction(formData)); // an action called outside a <form> must run in a transition
  }

  const selected = products.find((p) => p.id === productId);
  const started = state.tryOnId !== null && state.error === null;

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
        <h2 id="photo-heading" className="text-lg font-medium">
          2. Add a photo of yourself
        </h2>
        {photo ? (
          // The user's own photo, from their device: a blob: URL, so a plain <img> (next/image can't optimize it).
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo.previewUrl} alt="Your photo" className="max-h-96 w-auto self-start rounded-lg" />
        ) : (
          <label className="self-start rounded border px-4 py-2 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-black dark:has-[:focus-visible]:ring-white">
            {preparing ? "Preparing your photo…" : "Choose a photo"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={onChoose}
              disabled={preparing}
              className="sr-only"
            />
          </label>
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
      {/* Always in the page, so screen readers announce the text when it appears. */}
      <p role="status" className="text-zinc-700 dark:text-zinc-300">
        {started ? "We're creating your try-on. This can take a minute." : ""}
      </p>
    </div>
  );
}
