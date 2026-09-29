// @vitest-environment node
import { Prisma } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the database client: no MongoDB needed.
const { tryOn } = vi.hoisted(() => ({ tryOn: { create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn() } }));
vi.mock("./prisma", () => ({ prisma: { tryOn } }));

import {
  TRYON_LIMIT,
  TRYON_LIMIT_WINDOW_MS,
  TRYON_TTL_MS,
  TryOnRecordError,
  claimTryOn,
  completeTryOn,
  createTryOn,
  deleteTryOns,
  failTryOn,
  getSharedTryOn,
  getTryOnStatus,
  isOverTryOnLimit,
  listExpiredTryOns,
  listRecentTryOns,
  nextTryOnAllowedAt,
  type NewTryOn,
} from "./tryons";

const ID = "65f0c0ffee0000000000abcd";
const PRODUCT_ID = "65f0c0ffee0000000000beef";
const VALID: NewTryOn = {
  userId: "user_123",
  productId: PRODUCT_ID,
  personUrl: "https://res.cloudinary.com/demo/image/upload/mirror-ai/people/me.jpg",
};

function notMatched() {
  return new Prisma.PrismaClientKnownRequestError("Record not found", { code: "P2025", clientVersion: "6.19.3" });
}

async function recordError(promise: Promise<unknown>): Promise<TryOnRecordError> {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(TryOnRecordError);
  return error as TryOnRecordError;
}

describe("lib/tryons", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    tryOn.create.mockReset();
    tryOn.update.mockReset();
    tryOn.updateMany.mockReset();
    tryOn.findFirst.mockReset();
    tryOn.findMany.mockReset();
    tryOn.deleteMany.mockReset();
  });

  describe("createTryOn", () => {
    it("saves the try-on as PENDING, with a random share token for its public link", async () => {
      tryOn.create.mockResolvedValue({ id: ID, ...VALID, status: "PENDING" });
      await expect(createTryOn(VALID)).resolves.toMatchObject({ id: ID, status: "PENDING" });
      expect(tryOn.create).toHaveBeenCalledWith({
        data: { ...VALID, status: "PENDING", shareId: expect.stringMatching(/^[A-Za-z0-9_-]{22}$/) },
      });
    });

    it("gives every try-on a different share token (128 random bits, never the ObjectId)", async () => {
      tryOn.create.mockResolvedValue({ id: ID });
      await createTryOn(VALID);
      await createTryOn(VALID);
      const [first, second] = tryOn.create.mock.calls.map(([args]) => args.data.shareId as string);
      expect(first).not.toBe(second);
      expect(Buffer.from(first, "base64url")).toHaveLength(16);
      expect(first).not.toMatch(/^[a-f0-9]{24}$/i);
    });

    it.each([
      ["a missing user id", { userId: "  " }, "Please sign in to try garments on."],
      ["a malformed product id", { productId: "not-an-id" }, "That garment isn't available."],
      ["a non-https photo URL", { personUrl: "http://example.com/me.jpg" }, "Please add a photo of yourself."],
      ["a non-string photo URL", { personUrl: 42 }, "Please add a photo of yourself."],
    ])("rejects %s without touching the database", async (_case, override, message) => {
      const error = await recordError(createTryOn({ ...VALID, ...override } as NewTryOn));
      expect(error.code).toBe("INVALID_INPUT");
      expect(error.message).toBe(message);
      expect(tryOn.create).not.toHaveBeenCalled();
    });

    it("hides database errors from users but logs them", async () => {
      const dbError = new Error("connection refused (mongodb+srv://...)");
      tryOn.create.mockRejectedValue(dbError);
      const error = await recordError(createTryOn(VALID));
      expect(error.code).toBe("DB_ERROR");
      expect(error.message).toBe("Something went wrong saving your try-on. Please try again.");
      expect(error.cause).toBe(dbError);
      expect(console.error).toHaveBeenCalledWith("[tryons] createTryOn failed:", dbError);
    });
  });

  describe("claimTryOn", () => {
    const GARMENT_URL = "https://res.cloudinary.com/demo/image/upload/mirror-ai/garments/shirt.png";

    it("moves PENDING to PROCESSING in one conditional update and returns what the model needs", async () => {
      tryOn.update.mockResolvedValue({ personUrl: VALID.personUrl, product: { imageUrl: GARMENT_URL, category: "UPPER" } });
      await expect(claimTryOn(ID)).resolves.toEqual({
        personUrl: VALID.personUrl,
        garmentUrl: GARMENT_URL,
        category: "UPPER",
      });
      expect(tryOn.update).toHaveBeenCalledWith({
        where: { id: ID, status: "PENDING" }, // only matches a PENDING row: the claim is atomic
        data: { status: "PROCESSING" },
        select: { personUrl: true, product: { select: { imageUrl: true, category: true } } },
      });
    });

    it("returns null when the try-on is gone or already claimed (P2025)", async () => {
      tryOn.update.mockRejectedValue(notMatched());
      await expect(claimTryOn(ID)).resolves.toBeNull();
    });

    it("returns null for a malformed id without touching the database", async () => {
      await expect(claimTryOn("nope")).resolves.toBeNull();
      expect(tryOn.update).not.toHaveBeenCalled();
    });

    it("turns other database errors into DB_ERROR, so the job step is retried", async () => {
      tryOn.update.mockRejectedValue(new Error("timeout"));
      expect((await recordError(claimTryOn(ID))).code).toBe("DB_ERROR");
    });
  });

  describe("completeTryOn", () => {
    const RESULT = "https://res.cloudinary.com/demo/image/upload/mirror-ai/results/r.png";

    it("saves the result and marks DONE, only while PROCESSING", async () => {
      tryOn.update.mockResolvedValue({ id: ID });
      await expect(completeTryOn(ID, RESULT)).resolves.toBe(true);
      expect(tryOn.update).toHaveBeenCalledWith({
        where: { id: ID, status: "PROCESSING" },
        data: { status: "DONE", resultUrl: RESULT },
        select: { id: true },
      });
    });

    it("returns false when the try-on is gone or no longer PROCESSING (P2025)", async () => {
      tryOn.update.mockRejectedValue(notMatched());
      await expect(completeTryOn(ID, RESULT)).resolves.toBe(false);
    });

    it("returns false for a malformed id without touching the database", async () => {
      await expect(completeTryOn("nope", RESULT)).resolves.toBe(false);
      expect(tryOn.update).not.toHaveBeenCalled();
    });

    it("rejects a non-https result URL without touching the database", async () => {
      expect((await recordError(completeTryOn(ID, "http://example.com/r.png"))).code).toBe("INVALID_INPUT");
      expect(tryOn.update).not.toHaveBeenCalled();
    });

    it("turns other database errors into DB_ERROR", async () => {
      tryOn.update.mockRejectedValue(new Error("timeout"));
      expect((await recordError(completeTryOn(ID, RESULT))).code).toBe("DB_ERROR");
    });
  });

  describe("failTryOn", () => {
    it("marks the try-on FAILED with the user-safe message, only from the given statuses", async () => {
      tryOn.updateMany.mockResolvedValue({ count: 1 });
      await expect(failTryOn(ID, "We couldn't start your try-on.", ["PENDING"])).resolves.toBe(true);
      expect(tryOn.updateMany).toHaveBeenCalledWith({
        where: { id: ID, status: { in: ["PENDING"] } },
        data: { status: "FAILED", errorMessage: "We couldn't start your try-on." },
      });
    });

    it("returns false when nothing matched (gone, or already DONE), so a newer status wins", async () => {
      tryOn.updateMany.mockResolvedValue({ count: 0 });
      await expect(failTryOn(ID, "x", ["PROCESSING"])).resolves.toBe(false);
    });

    it("returns false for a malformed id without touching the database", async () => {
      await expect(failTryOn("nope", "x", ["PENDING"])).resolves.toBe(false);
      expect(tryOn.updateMany).not.toHaveBeenCalled();
    });

    it("turns database errors into DB_ERROR", async () => {
      tryOn.updateMany.mockRejectedValue(new Error("timeout"));
      expect((await recordError(failTryOn(ID, "x", ["PENDING"]))).code).toBe("DB_ERROR");
    });
  });

  describe("getTryOnStatus", () => {
    afterEach(() => vi.useRealTimers());

    it("finds the OWNER's try-on from the last 24 h and returns only the status fields", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-09-28T12:00:00Z"));
      const view = { status: "DONE", resultUrl: "https://res.cloudinary.com/demo/r.png", errorMessage: null };
      tryOn.findFirst.mockResolvedValue(view);

      await expect(getTryOnStatus(ID, "user_123")).resolves.toEqual(view);
      expect(tryOn.findFirst).toHaveBeenCalledWith({
        where: { id: ID, userId: "user_123", createdAt: { gt: new Date("2026-09-27T12:00:00Z") } },
        select: { status: true, resultUrl: true, errorMessage: true, shareId: true },
      });
      expect(TRYON_TTL_MS).toBe(86_400_000);
    });

    it("returns null when it doesn't exist, isn't theirs, or is too old (the query finds nothing)", async () => {
      tryOn.findFirst.mockResolvedValue(null);
      await expect(getTryOnStatus(ID, "user_other")).resolves.toBeNull();
    });

    it.each([
      ["a malformed id", "nope", "user_123"],
      ["an empty user id", ID, ""],
    ])("returns null for %s without touching the database", async (_case, id, userId) => {
      await expect(getTryOnStatus(id, userId)).resolves.toBeNull();
      expect(tryOn.findFirst).not.toHaveBeenCalled();
    });

    it("turns database errors into DB_ERROR", async () => {
      tryOn.findFirst.mockRejectedValue(new Error("timeout"));
      expect((await recordError(getTryOnStatus(ID, "user_123"))).code).toBe("DB_ERROR");
    });
  });

  describe("listRecentTryOns", () => {
    afterEach(() => vi.useRealTimers());

    it("lists the user's try-ons from the last 24 h, newest first, with only what /history shows", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-09-28T12:00:00Z"));
      tryOn.findMany.mockResolvedValue([{ id: ID }]);

      await expect(listRecentTryOns("user_123")).resolves.toEqual([{ id: ID }]);
      expect(tryOn.findMany).toHaveBeenCalledWith({
        where: { userId: "user_123", createdAt: { gt: new Date("2026-09-27T12:00:00Z") } },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          status: true,
          resultUrl: true,
          errorMessage: true,
          createdAt: true,
          product: { select: { name: true } },
        },
      });
    });

    it("returns nothing for an empty user id without touching the database", async () => {
      await expect(listRecentTryOns("")).resolves.toEqual([]);
      expect(tryOn.findMany).not.toHaveBeenCalled();
    });

    it("turns database errors into DB_ERROR", async () => {
      tryOn.findMany.mockRejectedValue(new Error("timeout"));
      expect((await recordError(listRecentTryOns("user_123"))).code).toBe("DB_ERROR");
    });
  });

  describe("the try-on limit (task 52)", () => {
    const NOW = new Date("2026-09-29T12:00:00Z");
    const minutesAgo = (m: number) => ({ createdAt: new Date(NOW.getTime() - m * 60_000) });

    it("is 3 per rolling hour", () => {
      expect(TRYON_LIMIT).toBe(3);
      expect(TRYON_LIMIT_WINDOW_MS).toBe(60 * 60 * 1000);
    });

    it("counts only the user's try-ons from the last hour that didn't fail, newest first", async () => {
      tryOn.findMany.mockResolvedValue([]);
      await nextTryOnAllowedAt("user_123", NOW);
      expect(tryOn.findMany).toHaveBeenCalledWith({
        where: { userId: "user_123", status: { not: "FAILED" }, createdAt: { gt: new Date("2026-09-29T11:00:00Z") } },
        orderBy: { createdAt: "desc" },
        take: 4,
        select: { createdAt: true },
      });
    });

    it("under the limit (2 this hour): may start one now", async () => {
      tryOn.findMany.mockResolvedValue([minutesAgo(5), minutesAgo(40)]);
      await expect(nextTryOnAllowedAt("user_123", NOW)).resolves.toBeNull();
    });

    it("at the limit (3 this hour): may start again when the oldest of the 3 is an hour old", async () => {
      tryOn.findMany.mockResolvedValue([minutesAgo(5), minutesAgo(20), minutesAgo(48)]);
      await expect(nextTryOnAllowedAt("user_123", NOW)).resolves.toEqual(new Date("2026-09-29T12:12:00Z"));
    });

    it("over the limit (4, after a race): still counts from the 3rd newest", async () => {
      tryOn.findMany.mockResolvedValue([minutesAgo(1), minutesAgo(2), minutesAgo(30), minutesAgo(50)]);
      await expect(nextTryOnAllowedAt("user_123", NOW)).resolves.toEqual(new Date("2026-09-29T12:30:00Z"));
    });

    it.each([
      [3, false],
      [4, true],
    ])("after saving, with %i counted this hour, isOverTryOnLimit is %s", async (count, over) => {
      tryOn.findMany.mockResolvedValue(Array.from({ length: count }, (_, i) => minutesAgo(i)));
      await expect(isOverTryOnLimit("user_123", NOW)).resolves.toBe(over);
    });

    it("rejects an empty user id without touching the database", async () => {
      expect((await recordError(nextTryOnAllowedAt("", NOW))).code).toBe("INVALID_INPUT");
      expect(tryOn.findMany).not.toHaveBeenCalled();
    });

    it("turns database errors into DB_ERROR (logged)", async () => {
      tryOn.findMany.mockRejectedValue(new Error("timeout"));
      expect((await recordError(isOverTryOnLimit("user_123", NOW))).code).toBe("DB_ERROR");
      expect(console.error).toHaveBeenCalledWith("[tryons] isOverTryOnLimit failed:", expect.any(Error));
    });
  });

  describe("listExpiredTryOns", () => {
    afterEach(() => vi.useRealTimers());

    it("finds try-ons at least 24 h old, across all users, oldest first, with just their image URLs", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-09-28T12:00:00Z"));
      tryOn.findMany.mockResolvedValue([{ id: ID }]);
      await expect(listExpiredTryOns(100)).resolves.toEqual([{ id: ID }]);
      expect(tryOn.findMany).toHaveBeenCalledWith({
        where: { createdAt: { lte: new Date("2026-09-27T12:00:00Z") } },
        orderBy: { createdAt: "asc" },
        take: 100,
        select: { id: true, personUrl: true, resultUrl: true },
      });
    });

    it("turns database errors into DB_ERROR", async () => {
      tryOn.findMany.mockRejectedValue(new Error("timeout"));
      expect((await recordError(listExpiredTryOns(100))).code).toBe("DB_ERROR");
    });
  });

  describe("deleteTryOns", () => {
    it("deletes the given rows (skipping malformed ids) and returns how many", async () => {
      tryOn.deleteMany.mockResolvedValue({ count: 1 });
      await expect(deleteTryOns([ID, "nope"])).resolves.toBe(1);
      expect(tryOn.deleteMany).toHaveBeenCalledWith({ where: { id: { in: [ID] } } });
    });

    it("does nothing (no database call) when there's nothing valid to delete", async () => {
      await expect(deleteTryOns([])).resolves.toBe(0);
      await expect(deleteTryOns(["nope"])).resolves.toBe(0);
      expect(tryOn.deleteMany).not.toHaveBeenCalled();
    });

    it("turns database errors into DB_ERROR", async () => {
      tryOn.deleteMany.mockRejectedValue(new Error("timeout"));
      expect((await recordError(deleteTryOns([ID]))).code).toBe("DB_ERROR");
    });
  });

  describe("getSharedTryOn", () => {
    const SHARE = "Zm9vYmFyYmF6cXV4MTIzNA"; // 22 base64url characters
    afterEach(() => vi.useRealTimers());

    it("finds the try-on by its share token (last 24 h) with only what the public page may show", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-09-28T12:00:00Z"));
      tryOn.findFirst.mockResolvedValue({ status: "DONE" });
      await expect(getSharedTryOn(SHARE)).resolves.toEqual({ status: "DONE" });
      expect(tryOn.findFirst).toHaveBeenCalledWith({
        where: { shareId: SHARE, createdAt: { gt: new Date("2026-09-27T12:00:00Z") } },
        select: { status: true, personUrl: true, resultUrl: true, createdAt: true, product: { select: { name: true } } },
      });
    });

    it.each([
      ["an ObjectId (so ids from other links can't be used)", ID],
      ["a too-short token", "abc"],
      ["a token with other characters", "Zm9vYmFyYmF6cXV4MTIz/A"],
      ["an empty string", ""],
    ])("returns null for %s without touching the database", async (_case, value) => {
      await expect(getSharedTryOn(value)).resolves.toBeNull();
      expect(tryOn.findFirst).not.toHaveBeenCalled();
    });

    it("returns null when no try-on has that token (or it's older than 24 h)", async () => {
      tryOn.findFirst.mockResolvedValue(null);
      await expect(getSharedTryOn(SHARE)).resolves.toBeNull();
    });

    it("turns database errors into DB_ERROR", async () => {
      tryOn.findFirst.mockRejectedValue(new Error("timeout"));
      expect((await recordError(getSharedTryOn(SHARE))).code).toBe("DB_ERROR");
    });
  });
});
