// @vitest-environment node
import { Prisma } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the database client: no MongoDB needed.
const { tryOn } = vi.hoisted(() => ({ tryOn: { create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), findFirst: vi.fn() } }));
vi.mock("./prisma", () => ({ prisma: { tryOn } }));

import {
  TRYON_TTL_MS,
  TryOnRecordError,
  claimTryOn,
  completeTryOn,
  createTryOn,
  failTryOn,
  getTryOnStatus,
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
  });

  describe("createTryOn", () => {
    it("saves the try-on as PENDING", async () => {
      tryOn.create.mockResolvedValue({ id: ID, ...VALID, status: "PENDING" });
      await expect(createTryOn(VALID)).resolves.toMatchObject({ id: ID, status: "PENDING" });
      expect(tryOn.create).toHaveBeenCalledWith({ data: { ...VALID, status: "PENDING" } });
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
        select: { status: true, resultUrl: true, errorMessage: true },
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
});
