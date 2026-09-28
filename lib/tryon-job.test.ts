// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Everything the job calls is mocked: the database rows, the model, and Cloudinary. Only the real
// TryOnError class is kept, because the job decides what to do based on it.
const m = vi.hoisted(() => ({
  claimTryOn: vi.fn(),
  completeTryOn: vi.fn(),
  failTryOn: vi.fn(),
  runTryOn: vi.fn(),
  uploadImage: vi.fn(),
  deleteImage: vi.fn(),
}));
vi.mock("./tryons", () => ({ claimTryOn: m.claimTryOn, completeTryOn: m.completeTryOn, failTryOn: m.failTryOn }));
vi.mock("./cloudinary", () => ({ uploadImage: m.uploadImage, deleteImage: m.deleteImage }));
vi.mock("./tryon", async () => {
  const actual = await vi.importActual<typeof import("./tryon")>("./tryon");
  return { TryOnError: actual.TryOnError, runTryOn: m.runTryOn };
});

import { TryOnError } from "./tryon";
import { handleTryOnFailure, processTryOn, tryOnJob, type StepRunner } from "./tryon-job";

const ID = "65f0c0ffee0000000000abcd";
const CLAIMED = {
  personUrl: "https://res.cloudinary.com/demo/image/upload/mirror-ai/people/me.jpg",
  garmentUrl: "https://res.cloudinary.com/demo/image/upload/mirror-ai/garments/shirt.png",
  category: "UPPER",
};
const SPACE_RESULT = "https://levihsu-ootdiffusion.hf.space/file=/tmp/gradio/result.png";
const STORED = { url: "https://res.cloudinary.com/demo/image/upload/mirror-ai/results/r.png", publicId: "mirror-ai/results/r" };

/** A fake Inngest step tool: runs each step right away and records its id, like one successful attempt. */
function fakeStep(): StepRunner & { ids: string[] } {
  const ids: string[] = [];
  return {
    ids,
    run: async <T,>(id: string, fn: () => Promise<T>) => {
      ids.push(id);
      return fn();
    },
  };
}

describe("lib/tryon-job", () => {
  beforeEach(() => {
    m.claimTryOn.mockResolvedValue(CLAIMED);
    m.runTryOn.mockResolvedValue({ resultImageUrl: SPACE_RESULT });
    m.uploadImage.mockResolvedValue({ ...STORED, width: 768, height: 1024 });
    m.completeTryOn.mockResolvedValue(true);
    m.failTryOn.mockResolvedValue(true);
    m.deleteImage.mockResolvedValue(true);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  describe("processTryOn", () => {
    it("claims, runs the model, copies the result to Cloudinary, and marks DONE", async () => {
      const step = fakeStep();
      await expect(processTryOn(ID, step)).resolves.toBe("done");

      expect(step.ids).toEqual(["claim", "run-model", "save-result"]);
      expect(m.claimTryOn).toHaveBeenCalledWith(ID);
      expect(m.runTryOn).toHaveBeenCalledWith({
        personImageUrl: CLAIMED.personUrl,
        garmentImageUrl: CLAIMED.garmentUrl,
        category: "UPPER",
      });
      expect(m.uploadImage).toHaveBeenCalledWith(SPACE_RESULT, "mirror-ai/results");
      expect(m.completeTryOn).toHaveBeenCalledWith(ID, STORED.url);
      expect(m.failTryOn).not.toHaveBeenCalled();
      expect(m.deleteImage).not.toHaveBeenCalled();
    });

    it("skips a try-on it can't claim (duplicate event, or deleted), without calling the model", async () => {
      m.claimTryOn.mockResolvedValue(null);
      const step = fakeStep();
      await expect(processTryOn(ID, step)).resolves.toBe("skipped");
      expect(step.ids).toEqual(["claim"]);
      expect(m.runTryOn).not.toHaveBeenCalled();
    });

    it.each([
      ["QUOTA", "Try-on is busy right now. Please try again later."],
      ["TIMEOUT", "The try-on took too long. Please try again."],
      ["NO_RESULT", "We couldn't create your try-on. Please try again."],
    ] as const)("on a %s model error, marks FAILED with its friendly message instead of retrying", async (code, message) => {
      m.runTryOn.mockRejectedValue(new TryOnError(code, message));
      const step = fakeStep();
      await expect(processTryOn(ID, step)).resolves.toBe("failed"); // resolves: no throw, so no Inngest retry
      expect(step.ids).toEqual(["claim", "run-model", "mark-failed"]);
      expect(m.failTryOn).toHaveBeenCalledWith(ID, message, ["PROCESSING"]);
      expect(m.uploadImage).not.toHaveBeenCalled();
    });

    it("rethrows an unexpected (non-TryOnError) error so Inngest retries, then onFailure handles it", async () => {
      const bug = new TypeError("Cannot read properties of undefined");
      m.runTryOn.mockRejectedValue(bug);
      await expect(processTryOn(ID, fakeStep())).rejects.toBe(bug);
      expect(m.failTryOn).not.toHaveBeenCalled();
    });

    it("throws when the result upload fails, so Inngest retries the step, and saves nothing", async () => {
      m.uploadImage.mockRejectedValue(new Error("upload failed"));
      await expect(processTryOn(ID, fakeStep())).rejects.toThrow("upload failed");
      expect(m.completeTryOn).not.toHaveBeenCalled();
    });

    it("deletes the uploaded result when marking DONE fails, then throws so the step is retried", async () => {
      const dbError = new Error("db down");
      m.completeTryOn.mockRejectedValue(dbError);
      await expect(processTryOn(ID, fakeStep())).rejects.toBe(dbError);
      expect(m.deleteImage).toHaveBeenCalledWith(STORED.publicId);
    });

    it("deletes the uploaded result when the try-on was deleted meanwhile, so no image is orphaned", async () => {
      m.completeTryOn.mockResolvedValue(false);
      await expect(processTryOn(ID, fakeStep())).resolves.toBe("gone");
      expect(m.deleteImage).toHaveBeenCalledWith(STORED.publicId);
    });
  });

  describe("handleTryOnFailure (after every retry is used up)", () => {
    it("marks the try-on FAILED with a generic message from PENDING or PROCESSING, and logs the error", async () => {
      const error = new Error("step save-result failed");
      await handleTryOnFailure(ID, error);
      expect(m.failTryOn).toHaveBeenCalledWith(ID, "We couldn't create your try-on. Please try again.", [
        "PENDING",
        "PROCESSING",
      ]);
      expect(console.error).toHaveBeenCalledWith(`[tryon-job] Try-on ${ID} failed after all retries:`, error);
    });
  });

  describe("tryOnJob (Inngest function)", () => {
    it("runs on tryon/requested with 3 retries and a failure handler", () => {
      expect(tryOnJob.id()).toBe("run-tryon");
      expect(tryOnJob.opts.triggers).toEqual([expect.objectContaining({ event: "tryon/requested" })]);
      expect(tryOnJob.opts.retries).toBe(3);
      expect(typeof tryOnJob.opts.onFailure).toBe("function");
    });

    it("onFailure reads the try-on id from the ORIGINAL event (event.data.event.data)", async () => {
      // Inngest passes a full context; only `event` and `error` are used, so this narrow type is enough.
      const onFailure = tryOnJob.opts.onFailure as unknown as (ctx: {
        event: { data: { event: { data: { tryOnId: string } } } };
        error: Error;
      }) => Promise<void>;
      await onFailure({ event: { data: { event: { data: { tryOnId: ID } } } }, error: new Error("boom") });
      expect(m.failTryOn).toHaveBeenCalledWith(ID, expect.any(String), ["PENDING", "PROCESSING"]);
    });
  });
});
