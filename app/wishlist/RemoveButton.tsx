"use client";

import { useState, useTransition } from "react";
import { removeFromWishlistAction } from "./actions";

type Props = { itemId: string; name: string };

/** Removes one saved item. The action refreshes /wishlist, so the item disappears when it succeeds. */
export default function RemoveButton({ itemId, name }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onRemove() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await removeFromWishlistAction(itemId);
        setError(result.error);
      } catch {
        // e.g. the network dropped: keep the message friendly instead of hitting an error boundary.
        setError("Something went wrong. Please try again.");
      }
    });
  }

  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={onRemove}
        aria-label={`Remove ${name} from wishlist`}
        className="underline disabled:opacity-50"
      >
        Remove
      </button>
      {error && (
        <span role="alert" className="text-red-600">
          {error}
        </span>
      )}
    </span>
  );
}
