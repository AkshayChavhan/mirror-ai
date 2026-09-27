// @vitest-environment node
import { Prisma } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the database client: no MongoDB needed.
const { tryOn } = vi.hoisted(() => ({ tryOn: { create: vi.fn(), update: vi.fn() } }));
vi.mock("./prisma", () => ({ prisma: { tryOn } }));

import { TryOnRecordError, createTryOn, failTryOn, type NewTryOn } from "./tryons";

const ID = "65f0c0ffee0000000000abcd";
const PRODUCT_ID = "65f0c0ffee0000000000beef";
const VALID: NewTryOn = {
  userId: "user_123",
  productId: PRODUCT_ID,
  personUrl: "https://res.cloudinary.com/demo/image/upload/mirror-ai/people/me.jpg",
};

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

  describe("failTryOn", () => {
    it("marks the try-on FAILED with the user-safe message", async () => {
      tryOn.update.mockResolvedValue({ id: ID });
      await expect(failTryOn(ID, "We couldn't start your try-on.")).resolves.toBeUndefined();
      expect(tryOn.update).toHaveBeenCalledWith({
        where: { id: ID },
        data: { status: "FAILED", errorMessage: "We couldn't start your try-on." },
      });
    });

    it("treats a malformed id as not found, without touching the database", async () => {
      const error = await recordError(failTryOn("nope", "x"));
      expect(error.code).toBe("NOT_FOUND");
      expect(tryOn.update).not.toHaveBeenCalled();
    });

    it("turns Prisma's record-not-found (P2025) into NOT_FOUND", async () => {
      tryOn.update.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError("Record not found", { code: "P2025", clientVersion: "6.19.3" }),
      );
      const error = await recordError(failTryOn(ID, "x"));
      expect(error.code).toBe("NOT_FOUND");
      expect(error.message).toBe("That try-on doesn't exist.");
    });

    it("turns other database errors into DB_ERROR", async () => {
      tryOn.update.mockRejectedValue(new Error("timeout"));
      expect((await recordError(failTryOn(ID, "x"))).code).toBe("DB_ERROR");
    });
  });
});
