"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { addToWishlistAction } from "./wishlist/actions";

type Props = { productId: string; name: string };

/** "Save" on a product card: adds it to the wishlist (works signed out too), then links to the list. */
export default function SaveButton({ productId, name }: Props) {
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onSave() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await addToWishlistAction(productId);
        setError(result.error);
        setSaved(result.error === null);
      } catch {
        // e.g. the network dropped: keep the message friendly instead of hitting an error boundary.
        setError("Something went wrong. Please try again.");
      }
    });
  }

  if (saved) {
    return (
      <span role="status" className="text-zinc-600 dark:text-zinc-400">
        Saved ·{" "}
        <Link href="/wishlist" className="underline">
          View wishlist
        </Link>
      </span>
    );
  }
  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={onSave}
        aria-label={`Save ${name} to wishlist`}
        className="underline disabled:opacity-50"
      >
        Save
      </button>
      {error && (
        <span role="alert" className="text-red-600">
          {error}
        </span>
      )}
    </span>
  );
}
