"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { claimAnonymousWishlistAction } from "./actions";

/**
 * Rendered on /wishlist only when a signed-in user still has an anonymous cookie: moves the items they
 * saved while signed out into their account, once, when the page opens. The action refreshes /wishlist.
 */
export default function ClaimAnonymousWishlist() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false); // React may run effects twice in development: claim once

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    startTransition(async () => {
      try {
        const result = await claimAnonymousWishlistAction();
        setError(result.error);
      } catch {
        setError("We couldn't move your saved items. Please reload the page.");
      }
    });
  }, []);

  if (error) {
    return (
      <p role="alert" className="text-red-600 dark:text-red-400">
        {error}
      </p>
    );
  }
  return pending ? (
    <p role="status" className="text-zinc-600 dark:text-zinc-400">
      Moving your saved items to your account…
    </p>
  ) : null;
}
