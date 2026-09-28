import { cron } from "inngest";
import { deleteImage, publicIdFromUrl } from "./cloudinary";
import { inngest } from "./inngest";
import type { StepRunner } from "./tryon-job";
import { deleteTryOns, listExpiredTryOns, type ExpiredTryOn } from "./tryons";

// Server-only: the hourly cleanup behind the 24 h privacy promise (docs/project-plan.md, "Privacy"):
// try-ons older than 24 h lose their Cloudinary images AND their rows, so nothing about them is kept.

const BATCH_SIZE = 100; // rows per run; anything left over is picked up next hour
const PARALLEL_ROWS = 5; // rows whose images are deleted at the same time
/** Only these folders hold try-on photos. Anything else (e.g. a garment image) is never deleted here. */
const TRYON_FOLDERS = ["mirror-ai/people/", "mirror-ai/results/"];

export type CleanupOutcome = { deleted: number; kept: number };

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

/** One cleanup run: find expired try-ons, delete their images, then delete the rows whose images are gone. */
export async function processCleanup(step: StepRunner): Promise<CleanupOutcome> {
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
