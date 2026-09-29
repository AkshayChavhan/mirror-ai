import { cron } from "inngest";
import { deleteImage, listImages, publicIdFromUrl } from "./cloudinary";
import { inngest } from "./inngest";
import type { StepRunner } from "./tryon-job";
import { TRYON_TTL_MS, deleteTryOns, listExpiredTryOns, type ExpiredTryOn } from "./tryons";

// Server-only: the hourly cleanup behind the 24 h privacy promise (docs/project-plan.md, "Privacy"):
// try-ons older than 24 h lose their Cloudinary images AND their rows, so nothing about them is kept.
// Then a sweep of the try-on folders catches any old image that no row points at (task 61).

const BATCH_SIZE = 100; // rows per run; anything left over is picked up next hour
const PARALLEL_ROWS = 5; // rows whose images are deleted at the same time
/** Only these folders hold try-on photos. Anything else (e.g. a garment image) is never deleted here. */
const TRYON_FOLDERS = ["mirror-ai/people/", "mirror-ai/results/"];

/**
 * The sweep deletes try-on images older than this: their 24 h lifetime plus an hour's margin (a photo is
 * uploaded just before its row is saved, and a late cleanup run still gets to the row first).
 */
const SWEEP_AGE_MS = TRYON_TTL_MS + 60 * 60 * 1000;
/** Admin API pages (500 images each) the sweep reads per folder per run: 10 means up to 5,000 images. */
const SWEEP_MAX_PAGES = 10;
const SWEEP_MAX_DELETES = 100; // images per run; anything left over is picked up next hour
const PARALLEL_DELETES = 5;

export type CleanupOutcome = { deleted: number; kept: number; swept: number };

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "not a URL";
  }
}

/** Deletes one row's images. True when they're all gone, so the row may be deleted too. */
async function deleteImagesOf(tryOn: ExpiredTryOn): Promise<boolean> {
  const urls = [tryOn.personUrl, tryOn.resultUrl].filter((url): url is string => Boolean(url));
  const results = await Promise.all(
    urls.map(async (url) => {
      const publicId = publicIdFromUrl(url);
      if (!publicId || !TRYON_FOLDERS.some((folder) => publicId.startsWith(folder))) {
        // Not one of our try-on images, so it can't be deleted here; don't keep the row forever for it. This
        // should never happen, so it's logged as an error, with a hint (never the photo's full URL).
        const hint = publicId ? `folder ${publicId.split("/").slice(0, -1).join("/")}` : `unreadable URL (${hostOf(url)})`;
        console.error(`[cleanup] Try-on ${tryOn.id} has an image outside the try-on folders (${hint}); leaving it alone.`);
        return true;
      }
      return deleteImage(publicId); // never throws: false means "try again next hour"
    }),
  );
  return results.every(Boolean);
}

/** The old try-on images in one folder (public ids), read page by page, up to SWEEP_MAX_PAGES. */
async function findOldImages(folder: string, cutoff: number): Promise<string[]> {
  const old: string[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < SWEEP_MAX_PAGES; page++) {
    const { images, nextCursor } = await listImages(folder, cursor);
    for (const { publicId, createdAt } of images) {
      // Deleting is final: re-check the folder, and skip a date that can't be read (NaN is never < cutoff).
      if (publicId.startsWith(folder) && Date.parse(createdAt) < cutoff) old.push(publicId);
    }
    if (!nextCursor) return old;
    cursor = nextCursor;
  }
  // Each run starts again at the first page, so images past the last page are never checked.
  console.error(`[cleanup] Sweep: ${folder} has more than ${SWEEP_MAX_PAGES} pages of images; not all were checked.`);
  return old;
}

/**
 * Deletes try-on images older than SWEEP_AGE_MS straight from the try-on folders, found by upload time
 * instead of through rows. Every try-on is deleted at 24 h, so no row points at these any more: e.g. a
 * photo whose best-effort delete failed after its row couldn't be saved. Garment images are never listed.
 * Never throws: a Cloudinary error is logged and the next hourly run tries again. Returns how many it deleted.
 */
export async function sweepOldImages(now = Date.now()): Promise<number> {
  const cutoff = now - SWEEP_AGE_MS;
  const old: string[] = [];
  for (const folder of TRYON_FOLDERS) {
    try {
      old.push(...(await findOldImages(folder, cutoff)));
    } catch (error) {
      // One folder failing (e.g. Cloudinary's rate limit) doesn't stop the other; the next run retries it.
      console.error(`[cleanup] Sweep: listing ${folder} failed; the next run retries it.`, error);
    }
  }

  const batch = old.slice(0, SWEEP_MAX_DELETES);
  if (old.length > batch.length) {
    console.error(`[cleanup] Sweep: ${old.length - batch.length} more old image(s) wait for the next run.`);
  }
  let deleted = 0;
  for (let i = 0; i < batch.length; i += PARALLEL_DELETES) {
    const chunk = batch.slice(i, i + PARALLEL_DELETES);
    const results = await Promise.all(chunk.map((publicId) => deleteImage(publicId))); // never throws
    deleted += results.filter(Boolean).length;
  }
  // Usually strays with no row; sometimes images of expired rows still queued (their row cleanup then finds "not found").
  if (deleted > 0) console.warn(`[cleanup] Sweep: deleted ${deleted} try-on image(s) older than 25 h.`);
  if (deleted < batch.length) {
    console.error(`[cleanup] Sweep: ${batch.length - deleted} old image(s) couldn't be deleted; the next run retries.`);
  }
  return deleted;
}

/** One cleanup run: expired rows first (their images, then the rows), then the folder sweep. */
export async function processCleanup(step: StepRunner): Promise<CleanupOutcome> {
  const { deleted, kept } = await cleanExpiredRows(step);
  const swept = await step.run("sweep-folders", () => sweepOldImages());
  return { deleted, kept, swept };
}

/** Finds expired try-ons, deletes their images, then deletes the rows whose images are gone. */
async function cleanExpiredRows(step: StepRunner): Promise<{ deleted: number; kept: number }> {
  const expired = await step.run("find-expired", () => listExpiredTryOns(BATCH_SIZE));
  if (expired.length === 0) return { deleted: 0, kept: 0 };

  const cleaned = await step.run("delete-images", async () => {
    const done: string[] = [];
    for (let i = 0; i < expired.length; i += PARALLEL_ROWS) {
      const chunk = expired.slice(i, i + PARALLEL_ROWS);
      const results = await Promise.all(chunk.map(deleteImagesOf));
      chunk.forEach((tryOn, j) => results[j] && done.push(tryOn.id));
    }
    return done;
  });

  // Only rows whose images are gone: a row whose image delete failed stays, so next hour can retry it.
  const deleted = cleaned.length > 0 ? await step.run("delete-rows", () => deleteTryOns(cleaned)) : 0;
  const kept = expired.length - cleaned.length;
  if (kept > 0) console.error(`[cleanup] ${kept} expired try-on(s) kept: their images couldn't be deleted yet.`);
  return { deleted, kept };
}

export const cleanupJob = inngest.createFunction(
  {
    id: "cleanup-expired-tryons",
    triggers: [cron("0 * * * *")], // every hour, on the hour
    concurrency: { limit: 1 }, // never two runs at once (a slow run can't overlap the next hour's)
  },
  ({ step }) =>
    processCleanup({
      // Same adapter as the try-on job: every step returns plain JSON (strings, null, numbers, no Dates).
      run: <T>(id: string, fn: () => Promise<T>) => step.run(id, fn) as Promise<T>,
    }),
);
