import { deleteImage, uploadImage } from "./cloudinary";
import { inngest, tryOnRequested } from "./inngest";
import { TryOnError, runTryOn } from "./tryon";
import { claimTryOn, completeTryOn, failTryOn } from "./tryons";

// Server-only: the background job behind one try-on (docs/project-plan.md, "Try-on job lifecycle").
// Triggered by the "tryon/requested" event that app/tryon/actions.ts sends.
//
// Each step.run() is saved by Inngest once it succeeds: when a later step fails and the function is
// retried, finished steps are skipped (so the model never runs twice for one retry).

const RESULTS_FOLDER = "mirror-ai/results";
const GENERIC_FAILURE = "We couldn't create your try-on. Please try again.";

/** The one Inngest step tool the job uses. A plain interface, so tests can pass a fake. */
export type StepRunner = {
  run<T>(id: string, fn: () => Promise<T>): Promise<T>;
};

export type TryOnJobOutcome = "skipped" | "done" | "failed" | "gone";

type ModelOutcome = { ok: true; resultImageUrl: string } | { ok: false; message: string };

/** Runs one try-on: PROCESSING → model → result on Cloudinary → DONE, or FAILED. */
export async function processTryOn(tryOnId: string, step: StepRunner): Promise<TryOnJobOutcome> {
  // 1. Claim it (PENDING → PROCESSING). Null: a duplicate event, or the try-on was deleted.
  const job = await step.run("claim", () => claimTryOn(tryOnId));
  if (!job) return "skipped";

  // 2. Run the model. Its own failures (quota, timeout, no result…) are RETURNED, not thrown:
  //    an Inngest retry would call the model again and spend more GPU quota. The user can retry.
  const model = await step.run("run-model", async (): Promise<ModelOutcome> => {
    try {
      const { resultImageUrl } = await runTryOn({
        personImageUrl: job.personUrl,
        garmentImageUrl: job.garmentUrl,
        category: job.category,
      });
      return { ok: true, resultImageUrl };
    } catch (error) {
      if (error instanceof TryOnError) return { ok: false, message: error.message }; // already user-safe
      throw error;
    }
  });

  if (!model.ok) {
    await step.run("mark-failed", () => failTryOn(tryOnId, model.message, ["PROCESSING"]));
    return "failed";
  }

  // 3. Copy the result to Cloudinary (the Space's URL is temporary) and mark DONE in ONE step, so a
  //    result image is never left without a row pointing at it (the 24 h cleanup finds images via rows;
  //    the folder sweep only catches strays after 25 h).
  const saved = await step.run("save-result", async () => {
    const uploaded = await uploadImage(model.resultImageUrl, RESULTS_FOLDER);
    let completed: boolean;
    try {
      completed = await completeTryOn(tryOnId, uploaded.url);
    } catch (error) {
      await deleteImage(uploaded.publicId);
      throw error; // Inngest retries this step, which uploads again
    }
    if (!completed) await deleteImage(uploaded.publicId); // the row was deleted, or isn't PROCESSING any more
    return completed;
  });
  return saved ? "done" : "gone";
}

/** Runs once Inngest has used up every retry: don't leave the user's try-on spinning forever. */
export async function handleTryOnFailure(tryOnId: string, error: unknown): Promise<void> {
  console.error(`[tryon-job] Try-on ${tryOnId} failed after all retries:`, error);
  await failTryOn(tryOnId, GENERIC_FAILURE, ["PENDING", "PROCESSING"]);
}

export const tryOnJob = inngest.createFunction(
  {
    id: "run-tryon",
    triggers: [tryOnRequested],
    retries: 3, // per step, for database/Cloudinary hiccups (the model's own failures aren't retried)
    onFailure: ({ event, error }) => handleTryOnFailure(event.data.event.data.tryOnId, error),
  },
  ({ event, step }) =>
    processTryOn(event.data.tryOnId, {
      // Inngest types a step's result as Jsonify<T> (T after a JSON round trip). Every step above
      // returns plain JSON (strings, booleans, null, flat objects), where Jsonify<T> is exactly T.
      run: <T>(id: string, fn: () => Promise<T>) => step.run(id, fn) as Promise<T>,
    }),
);
