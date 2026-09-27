"use client";

import { useState, useTransition } from "react";
import { deleteProductAction, setProductActiveAction } from "./actions";

type Props = { id: string; name: string; isActive: boolean };

/** Hide/Show and Delete buttons for one product row in the admin list. */
export default function ProductRowActions({ id, name, isActive }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(action: () => Promise<{ error: string | null }>) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await action();
        setError(result.error);
      } catch {
        // e.g. the network dropped: keep the message friendly instead of hitting an error boundary.
        setError("Something went wrong. Please try again.");
      }
    });
  }

  function onDelete() {
    // Destructive: ask first (Next's Server Actions guide recommends stronger handling for deletes).
    if (!window.confirm(`Delete "${name}"? This also removes its try-ons and wishlist entries.`)) return;
    run(() => deleteProductAction(id));
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        disabled={pending}
        onClick={() => run(() => setProductActiveAction(id, !isActive))}
        aria-label={`${isActive ? "Hide" : "Show"} ${name}`}
        className="underline disabled:opacity-50"
      >
        {isActive ? "Hide" : "Show"}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={onDelete}
        aria-label={`Delete ${name}`}
        className="text-red-600 underline disabled:opacity-50"
      >
        Delete
      </button>
      {error && (
        <span role="alert" className="text-sm text-red-600">
          {error}
        </span>
      )}
    </div>
  );
}
