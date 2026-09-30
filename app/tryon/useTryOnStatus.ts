"use client";

import { useEffect, useState } from "react";

// Browser-only: the loading screen's polling (task 43). Asks GET /api/tryon/[id]/status (task 40) every few
// seconds until the try-on is DONE or FAILED, or it can't be checked any more.

export const POLL_MS = 2_500;
/** After this, the screen says it's taking longer than usual (the model can queue for a GPU). */
export const SLOW_AFTER_MS = 60_000;
/** After this, polling stops: the try-on will still show up on /history. */
export const GIVE_UP_AFTER_MS = 5 * 60_000;
/** Network or server errors in a row before giving up (one blip doesn't stop the screen). */
export const MAX_ERRORS_IN_A_ROW = 5;
/** A status request that hasn't answered by then counts as an error, so one hung request can't stop polling. */
export const REQUEST_TIMEOUT_MS = 10_000;

export type TryOnProgress =
  | { kind: "waiting"; status: "PENDING" | "PROCESSING"; slow: boolean }
  | { kind: "done"; shareId: string }
  | { kind: "failed"; message: string }
  | { kind: "lost"; message: string }; // polling stopped without an answer: see /history

const STARTING: TryOnProgress = { kind: "waiting", status: "PENDING", slow: false };
const LOST_CONNECTION = "We couldn't check your try-on. It will be in your history when it's ready.";
const TOOK_TOO_LONG = "This is taking much longer than usual. Your try-on will be in your history when it's ready.";

/** One status reply as progress, or "retry" for a hiccup worth asking again about (5xx, network, odd reply). */
export function interpretStatus(httpStatus: number, body: unknown): TryOnProgress | "retry" {
  if (httpStatus === 401) return { kind: "lost", message: "Your session ended. Sign in again to see your try-on in your history." };
  if (httpStatus === 404) return { kind: "lost", message: "We couldn't find that try-on." };
  if (httpStatus !== 200 || typeof body !== "object" || body === null || !("status" in body)) return "retry";
  const { status } = body;
  const errorMessage = "errorMessage" in body ? body.errorMessage : null;
  const shareId = "shareId" in body ? body.shareId : null;
  switch (status) {
    case "PENDING":
    case "PROCESSING":
      return { kind: "waiting", status, slow: false };
    case "DONE":
      return typeof shareId === "string" && shareId
        ? { kind: "done", shareId }
        : { kind: "lost", message: "Your try-on is ready. Find it in your history." };
    case "FAILED":
      return { kind: "failed", message: typeof errorMessage === "string" && errorMessage ? errorMessage : "This try-on didn't work." };
    default:
      return "retry";
  }
}

/** The progress of `tryOnId` (null when there's nothing to watch). Polling stops on unmount or a new id. */
export function useTryOnStatus(tryOnId: string | null): TryOnProgress | null {
  // Kept with its id, so a new id starts from "waiting" without resetting state inside the effect.
  const [latest, setLatest] = useState<{ id: string; progress: TryOnProgress } | null>(null);

  useEffect(() => {
    if (!tryOnId) return;
    const id = tryOnId;
    const controller = new AbortController();
    const startedAt = Date.now();
    let errorsInARow = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const report = (progress: TryOnProgress) => setLatest({ id, progress });

    async function poll(): Promise<void> {
      let next: TryOnProgress | "retry";
      // Each request has its own time limit, and is also cancelled when polling stops.
      const request = new AbortController();
      const cancelRequest = () => request.abort();
      controller.signal.addEventListener("abort", cancelRequest);
      const requestTimer = setTimeout(cancelRequest, REQUEST_TIMEOUT_MS);
      try {
        const response = await fetch(`/api/tryon/${encodeURIComponent(id)}/status`, {
          cache: "no-store",
          signal: request.signal,
        });
        next = interpretStatus(response.status, await response.json().catch(() => null));
      } catch {
        next = "retry"; // offline, timed out, or polling stopped (checked below)
      } finally {
        clearTimeout(requestTimer);
        controller.signal.removeEventListener("abort", cancelRequest);
      }
      if (controller.signal.aborted) return; // closed, or watching another try-on now

      const waited = Date.now() - startedAt;
      if (next === "retry") {
        errorsInARow += 1;
        if (errorsInARow >= MAX_ERRORS_IN_A_ROW) return report({ kind: "lost", message: LOST_CONNECTION });
      } else {
        errorsInARow = 0;
        if (next.kind !== "waiting") return report(next); // done, failed or lost: stop polling
        report({ ...next, slow: waited >= SLOW_AFTER_MS });
      }
      if (waited >= GIVE_UP_AFTER_MS) return report({ kind: "lost", message: TOOK_TOO_LONG });
      timer = setTimeout(poll, POLL_MS);
    }

    void poll(); // the first check right away
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [tryOnId]);

  if (!tryOnId) return null;
  return latest?.id === tryOnId ? latest.progress : STARTING;
}
