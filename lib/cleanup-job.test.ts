// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The rows and Cloudinary's delete are mocked. The real publicIdFromUrl is kept: the job relies on it.
const m = vi.hoisted(() => ({ listExpiredTryOns: vi.fn(), deleteTryOns: vi.fn(), deleteImage: vi.fn() }));
vi.mock("./tryons", () => ({ listExpiredTryOns: m.listExpiredTryOns, deleteTryOns: m.deleteTryOns }));
vi.mock("./cloudinary", async () => {
  const actual = await vi.importActual<typeof import("./cloudinary")>("./cloudinary");
  return { publicIdFromUrl: actual.publicIdFromUrl, deleteImage: m.deleteImage };
});

import { cleanupJob, processCleanup } from "./cleanup-job";
import type { StepRunner } from "./tryon-job";

const url = (publicId: string) => `https://res.cloudinary.com/demo/image/upload/v1712345678/${publicId}.jpg`;
const row = (n: number, over: Record<string, unknown> = {}) => ({
  id: `65f0c0ffee0000000000000${n}`,
  personUrl: url(`mirror-ai/people/p${n}`),
  resultUrl: url(`mirror-ai/results/r${n}`),
  ...over,
});

/** A fake Inngest step tool: runs each step right away and records its id. */
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

describe("lib/cleanup-job", () => {
  beforeEach(() => {
    m.listExpiredTryOns.mockResolvedValue([]);
    m.deleteImage.mockResolvedValue(true);
    m.deleteTryOns.mockImplementation(async (ids: string[]) => ids.length);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("does nothing when no try-on is older than 24 h", async () => {
    const step = fakeStep();
    await expect(processCleanup(step)).resolves.toEqual({ deleted: 0, kept: 0 });
    expect(step.ids).toEqual(["find-expired"]);
    expect(m.listExpiredTryOns).toHaveBeenCalledWith(100);
    expect(m.deleteImage).not.toHaveBeenCalled();
    expect(m.deleteTryOns).not.toHaveBeenCalled();
  });

  it("deletes the person photo and the result of each expired try-on, then the rows", async () => {
    m.listExpiredTryOns.mockResolvedValue([row(1), row(2)]);
    const step = fakeStep();
    await expect(processCleanup(step)).resolves.toEqual({ deleted: 2, kept: 0 });
    expect(step.ids).toEqual(["find-expired", "delete-images", "delete-rows"]);
    expect(m.deleteImage.mock.calls.map(([id]) => id).sort()).toEqual([
      "mirror-ai/people/p1",
      "mirror-ai/people/p2",
      "mirror-ai/results/r1",
      "mirror-ai/results/r2",
    ]);
    expect(m.deleteTryOns).toHaveBeenCalledWith([row(1).id, row(2).id]);
  });

  it("handles a try-on with no result (it failed or never finished)", async () => {
    m.listExpiredTryOns.mockResolvedValue([row(1, { resultUrl: null })]);
    await expect(processCleanup(fakeStep())).resolves.toEqual({ deleted: 1, kept: 0 });
    expect(m.deleteImage).toHaveBeenCalledTimes(1);
    expect(m.deleteImage).toHaveBeenCalledWith("mirror-ai/people/p1");
  });

  it("KEEPS a row whose image couldn't be deleted, so the next run retries it (no orphaned photo)", async () => {
    m.listExpiredTryOns.mockResolvedValue([row(1), row(2)]);
    m.deleteImage.mockImplementation(async (id: string) => id !== "mirror-ai/results/r2");
    await expect(processCleanup(fakeStep())).resolves.toEqual({ deleted: 1, kept: 1 });
    expect(m.deleteTryOns).toHaveBeenCalledWith([row(1).id]); // row 2 stays
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("1 expired try-on(s) kept"));
  });

  it("skips the row delete step entirely when no image could be deleted", async () => {
    m.listExpiredTryOns.mockResolvedValue([row(1)]);
    m.deleteImage.mockResolvedValue(false);
    const step = fakeStep();
    await expect(processCleanup(step)).resolves.toEqual({ deleted: 0, kept: 1 });
    expect(step.ids).toEqual(["find-expired", "delete-images"]);
    expect(m.deleteTryOns).not.toHaveBeenCalled();
  });

  it.each([
    ["a garment image", url("mirror-ai/garments/shirt"), "folder mirror-ai/garments"],
    ["a URL that isn't Cloudinary's", "https://example.com/photo.jpg", "unreadable URL (example.com)"],
  ])("never deletes %s, logs an error with a safe hint, and still removes the row", async (_case, personUrl, hint) => {
    m.listExpiredTryOns.mockResolvedValue([row(1, { personUrl, resultUrl: null })]);
    await expect(processCleanup(fakeStep())).resolves.toEqual({ deleted: 1, kept: 0 });
    expect(m.deleteImage).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining(`outside the try-on folders (${hint})`));
    expect(console.error).not.toHaveBeenCalledWith(expect.stringContaining(personUrl)); // never the full URL
  });

  it("works through more rows than it deletes at once", async () => {
    const rows = Array.from({ length: 7 }, (_, i) => row(i));
    m.listExpiredTryOns.mockResolvedValue(rows);
    await expect(processCleanup(fakeStep())).resolves.toEqual({ deleted: 7, kept: 0 });
    expect(m.deleteImage).toHaveBeenCalledTimes(14);
  });

  it("lets a database error in a step throw, so Inngest retries that step", async () => {
    m.listExpiredTryOns.mockResolvedValue([row(1)]);
    m.deleteTryOns.mockRejectedValue(new Error("db down"));
    await expect(processCleanup(fakeStep())).rejects.toThrow("db down");
  });

  it("is an Inngest function that runs every hour, on the hour, one run at a time", () => {
    expect(cleanupJob.id()).toBe("cleanup-expired-tryons");
    expect(cleanupJob.opts.triggers).toEqual([{ cron: "0 * * * *" }]);
    expect(cleanupJob.opts.concurrency).toEqual({ limit: 1 });
  });
});
