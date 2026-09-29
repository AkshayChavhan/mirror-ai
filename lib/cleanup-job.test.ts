// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The rows and Cloudinary's delete and list are mocked. The real publicIdFromUrl is kept: the job relies on it.
const m = vi.hoisted(() => ({ listExpiredTryOns: vi.fn(), deleteTryOns: vi.fn(), deleteImage: vi.fn(), listImages: vi.fn() }));
vi.mock("./tryons", () => ({
  TRYON_TTL_MS: 24 * 60 * 60 * 1000,
  listExpiredTryOns: m.listExpiredTryOns,
  deleteTryOns: m.deleteTryOns,
}));
vi.mock("./cloudinary", async () => {
  const actual = await vi.importActual<typeof import("./cloudinary")>("./cloudinary");
  return { publicIdFromUrl: actual.publicIdFromUrl, deleteImage: m.deleteImage, listImages: m.listImages };
});

import { cleanupJob, processCleanup, sweepOldImages } from "./cleanup-job";
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
    m.listImages.mockResolvedValue({ images: [], nextCursor: null }); // empty folders: nothing to sweep
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("deletes no rows when no try-on is older than 24 h, but still sweeps the folders", async () => {
    const step = fakeStep();
    await expect(processCleanup(step)).resolves.toEqual({ deleted: 0, kept: 0, swept: 0 });
    expect(step.ids).toEqual(["find-expired", "sweep-folders"]);
    expect(m.listExpiredTryOns).toHaveBeenCalledWith(100);
    expect(m.deleteImage).not.toHaveBeenCalled();
    expect(m.deleteTryOns).not.toHaveBeenCalled();
  });

  it("deletes the person photo and the result of each expired try-on, then the rows", async () => {
    m.listExpiredTryOns.mockResolvedValue([row(1), row(2)]);
    const step = fakeStep();
    await expect(processCleanup(step)).resolves.toEqual({ deleted: 2, kept: 0, swept: 0 });
    expect(step.ids).toEqual(["find-expired", "delete-images", "delete-rows", "sweep-folders"]);
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
    await expect(processCleanup(fakeStep())).resolves.toEqual({ deleted: 1, kept: 0, swept: 0 });
    expect(m.deleteImage).toHaveBeenCalledTimes(1);
    expect(m.deleteImage).toHaveBeenCalledWith("mirror-ai/people/p1");
  });

  it("KEEPS a row whose image couldn't be deleted, so the next run retries it (no orphaned photo)", async () => {
    m.listExpiredTryOns.mockResolvedValue([row(1), row(2)]);
    m.deleteImage.mockImplementation(async (id: string) => id !== "mirror-ai/results/r2");
    await expect(processCleanup(fakeStep())).resolves.toEqual({ deleted: 1, kept: 1, swept: 0 });
    expect(m.deleteTryOns).toHaveBeenCalledWith([row(1).id]); // row 2 stays
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("1 expired try-on(s) kept"));
  });

  it("skips the row delete step entirely when no image could be deleted", async () => {
    m.listExpiredTryOns.mockResolvedValue([row(1)]);
    m.deleteImage.mockResolvedValue(false);
    const step = fakeStep();
    await expect(processCleanup(step)).resolves.toEqual({ deleted: 0, kept: 1, swept: 0 });
    expect(step.ids).toEqual(["find-expired", "delete-images", "sweep-folders"]);
    expect(m.deleteTryOns).not.toHaveBeenCalled();
  });

  it.each([
    ["a garment image", url("mirror-ai/garments/shirt"), "folder mirror-ai/garments"],
    ["a URL that isn't Cloudinary's", "https://example.com/photo.jpg", "unreadable URL (example.com)"],
  ])("never deletes %s, logs an error with a safe hint, and still removes the row", async (_case, personUrl, hint) => {
    m.listExpiredTryOns.mockResolvedValue([row(1, { personUrl, resultUrl: null })]);
    await expect(processCleanup(fakeStep())).resolves.toEqual({ deleted: 1, kept: 0, swept: 0 });
    expect(m.deleteImage).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining(`outside the try-on folders (${hint})`));
    expect(console.error).not.toHaveBeenCalledWith(expect.stringContaining(personUrl)); // never the full URL
  });

  it("works through more rows than it deletes at once", async () => {
    const rows = Array.from({ length: 7 }, (_, i) => row(i));
    m.listExpiredTryOns.mockResolvedValue(rows);
    await expect(processCleanup(fakeStep())).resolves.toEqual({ deleted: 7, kept: 0, swept: 0 });
    expect(m.deleteImage).toHaveBeenCalledTimes(14);
  });

  it("lets a database error in a step throw, so Inngest retries that step", async () => {
    m.listExpiredTryOns.mockResolvedValue([row(1)]);
    m.deleteTryOns.mockRejectedValue(new Error("db down"));
    await expect(processCleanup(fakeStep())).rejects.toThrow("db down");
  });

  describe("the folder sweep (task 61)", () => {
    const HOUR = 60 * 60 * 1000;
    const image = (publicId: string, hoursOld: number) => ({
      publicId,
      createdAt: new Date(Date.now() - hoursOld * HOUR).toISOString(),
    });
    /** One page per folder, no next page. */
    function folders(pages: Record<string, ReturnType<typeof image>[]>) {
      m.listImages.mockImplementation(async (prefix: string) => ({ images: pages[prefix] ?? [], nextCursor: null }));
    }

    it("deletes images older than 25 h from the people and results folders, and keeps newer ones", async () => {
      folders({
        "mirror-ai/people/": [image("mirror-ai/people/old", 26), image("mirror-ai/people/edge", 24.9), image("mirror-ai/people/new", 1)],
        "mirror-ai/results/": [image("mirror-ai/results/old", 25.1)],
      });
      await expect(sweepOldImages()).resolves.toBe(2);
      expect(m.deleteImage.mock.calls.map(([id]) => id).sort()).toEqual(["mirror-ai/people/old", "mirror-ai/results/old"]);
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("deleted 2 try-on image(s) older than 25 h"));
    });

    it("lists only the two try-on folders, never garments", async () => {
      await sweepOldImages();
      expect(m.listImages.mock.calls).toEqual([
        ["mirror-ai/people/", undefined],
        ["mirror-ai/results/", undefined],
      ]);
    });

    it("skips an image outside the folder it was listed for, or with a date it can't read", async () => {
      folders({
        "mirror-ai/people/": [image("mirror-ai/garments/shirt", 48), { publicId: "mirror-ai/people/x", createdAt: "not a date" }],
      });
      await expect(sweepOldImages()).resolves.toBe(0);
      expect(m.deleteImage).not.toHaveBeenCalled();
    });

    it("follows the cursor to the next page", async () => {
      m.listImages
        .mockResolvedValueOnce({ images: [image("mirror-ai/people/a", 30)], nextCursor: "page-2" })
        .mockResolvedValueOnce({ images: [image("mirror-ai/people/b", 30)], nextCursor: null });
      await expect(sweepOldImages()).resolves.toBe(2);
      expect(m.listImages).toHaveBeenNthCalledWith(2, "mirror-ai/people/", "page-2");
    });

    it("reads at most 10 pages per folder, and logs that not all were checked", async () => {
      m.listImages.mockResolvedValue({ images: [], nextCursor: "more" });
      await expect(sweepOldImages()).resolves.toBe(0);
      expect(m.listImages).toHaveBeenCalledTimes(20);
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining("mirror-ai/people/ has more than 10 pages"));
    });

    it.each([
      ["the first folder", "mirror-ai/people/", "mirror-ai/results/"],
      ["the second folder", "mirror-ai/results/", "mirror-ai/people/"],
    ])("never throws when listing %s fails: logs it and still sweeps the other", async (_case, failing, working) => {
      const listError = new Error("Rate Limit Exceeded");
      m.listImages.mockImplementation(async (prefix: string) => {
        if (prefix === failing) throw listError;
        return { images: [image(`${working}old`, 30)], nextCursor: null };
      });
      await expect(sweepOldImages()).resolves.toBe(1);
      expect(m.deleteImage).toHaveBeenCalledWith(`${working}old`);
      expect(console.error).toHaveBeenCalledWith(`[cleanup] Sweep: listing ${failing} failed; the next run retries it.`, listError);
    });

    it("deletes at most 100 images per run, and logs how many wait", async () => {
      folders({ "mirror-ai/people/": Array.from({ length: 105 }, (_, i) => image(`mirror-ai/people/p${i}`, 30)) });
      await expect(sweepOldImages()).resolves.toBe(100);
      expect(m.deleteImage).toHaveBeenCalledTimes(100);
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining("5 more old image(s) wait"));
    });

    it("counts only the deletes that worked, and logs the rest for the next run", async () => {
      folders({ "mirror-ai/people/": [image("mirror-ai/people/a", 30), image("mirror-ai/people/b", 30)] });
      m.deleteImage.mockImplementation(async (id: string) => id !== "mirror-ai/people/b");
      await expect(sweepOldImages()).resolves.toBe(1);
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining("1 old image(s) couldn't be deleted"));
    });

    it("runs as the last step of every cleanup run, and reports what it swept", async () => {
      folders({ "mirror-ai/results/": [image("mirror-ai/results/old", 30)] });
      const step = fakeStep();
      await expect(processCleanup(step)).resolves.toEqual({ deleted: 0, kept: 0, swept: 1 });
      expect(step.ids).toEqual(["find-expired", "sweep-folders"]);
    });
  });

  it("is an Inngest function that runs every hour, on the hour, one run at a time", () => {
    expect(cleanupJob.id()).toBe("cleanup-expired-tryons");
    expect(cleanupJob.opts.triggers).toEqual([{ cron: "0 * * * *" }]);
    expect(cleanupJob.opts.concurrency).toEqual({ limit: 1 });
  });
});
