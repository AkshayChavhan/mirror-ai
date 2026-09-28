// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the database client: no MongoDB needed.
const { wishlistItem } = vi.hoisted(() => ({ wishlistItem: { create: vi.fn(), deleteMany: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() } }));
vi.mock("./prisma", () => ({ prisma: { wishlistItem } }));

import {
  WishlistError,
  addWishlistItem,
  claimAnonymousItems,
  listWishlist,
  removeWishlistItem,
  type WishlistOwner,
} from "./wishlist";

const PRODUCT_ID = "65f0c0ffee0000000000beef";
const ITEM_ID = "65f0c0ffee0000000000abcd";
const USER: WishlistOwner = { userId: "user_123" };
const ANON: WishlistOwner = { anonymousId: "3f2b8c1e-9d4a-4b7e-8a21-5c6d7e8f9a0b" };

async function wishlistError(promise: Promise<unknown>): Promise<WishlistError> {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(WishlistError);
  return error as WishlistError;
}

describe("lib/wishlist", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    wishlistItem.create.mockReset();
    wishlistItem.deleteMany.mockReset();
    wishlistItem.findMany.mockReset();
    wishlistItem.updateMany.mockReset();
  });

  describe("addWishlistItem", () => {
    it.each([
      ["a signed-in user", USER, { userId: "user_123" }],
      ["an anonymous visitor", ANON, { anonymousId: ANON.anonymousId }],
    ] as const)("saves the product for %s (only their own id column is set)", async (_case, owner, fields) => {
      wishlistItem.create.mockResolvedValue({ id: ITEM_ID });
      await expect(addWishlistItem(owner, PRODUCT_ID)).resolves.toEqual({ id: ITEM_ID });
      expect(wishlistItem.create).toHaveBeenCalledWith({ data: { ...fields, productId: PRODUCT_ID } });
    });

    it("rejects a malformed product id without touching the database", async () => {
      expect((await wishlistError(addWishlistItem(USER, "nope"))).code).toBe("INVALID_INPUT");
      expect(wishlistItem.create).not.toHaveBeenCalled();
    });

    it.each([
      ["an empty user id", { userId: "" }],
      ["an empty anonymous id", { anonymousId: "" }],
    ])("rejects %s (no owner) without touching the database", async (_case, owner) => {
      expect((await wishlistError(addWishlistItem(owner as WishlistOwner, PRODUCT_ID))).code).toBe("INVALID_INPUT");
      expect(wishlistItem.create).not.toHaveBeenCalled();
    });

    it("hides database errors from users but logs them", async () => {
      const dbError = new Error("connection refused");
      wishlistItem.create.mockRejectedValue(dbError);
      const error = await wishlistError(addWishlistItem(USER, PRODUCT_ID));
      expect(error.code).toBe("DB_ERROR");
      expect(error.message).toBe("Something went wrong with your wishlist. Please try again.");
      expect(console.error).toHaveBeenCalledWith("[wishlist] addWishlistItem failed:", dbError);
    });
  });

  describe("removeWishlistItem", () => {
    it.each([
      ["a signed-in user", USER, { userId: "user_123" }],
      ["an anonymous visitor", ANON, { anonymousId: ANON.anonymousId }],
    ] as const)("deletes the item only if it belongs to %s (owner in the query)", async (_case, owner, fields) => {
      wishlistItem.deleteMany.mockResolvedValue({ count: 1 });
      await expect(removeWishlistItem(owner, ITEM_ID)).resolves.toBe(true);
      expect(wishlistItem.deleteMany).toHaveBeenCalledWith({ where: { id: ITEM_ID, ...fields } });
    });

    it("returns false when nothing matched (missing, or someone else's item)", async () => {
      wishlistItem.deleteMany.mockResolvedValue({ count: 0 });
      await expect(removeWishlistItem(USER, ITEM_ID)).resolves.toBe(false);
    });

    it("rejects an empty owner without touching the database", async () => {
      expect((await wishlistError(removeWishlistItem({ anonymousId: "" }, ITEM_ID))).code).toBe("INVALID_INPUT");
      expect(wishlistItem.deleteMany).not.toHaveBeenCalled();
    });

    it("returns false for a malformed item id without touching the database", async () => {
      await expect(removeWishlistItem(USER, "nope")).resolves.toBe(false);
      expect(wishlistItem.deleteMany).not.toHaveBeenCalled();
    });

    it("turns database errors into DB_ERROR", async () => {
      wishlistItem.deleteMany.mockRejectedValue(new Error("timeout"));
      expect((await wishlistError(removeWishlistItem(ANON, ITEM_ID))).code).toBe("DB_ERROR");
    });
  });

  describe("listWishlist", () => {
    it.each([
      ["a signed-in user", USER, { userId: "user_123" }],
      ["an anonymous visitor", ANON, { anonymousId: ANON.anonymousId }],
    ] as const)("lists %s's items for visible garments, newest first, with only what the page shows", async (_case, owner, fields) => {
      wishlistItem.findMany.mockResolvedValue([{ id: ITEM_ID }]);
      await expect(listWishlist(owner)).resolves.toEqual([{ id: ITEM_ID }]);
      expect(wishlistItem.findMany).toHaveBeenCalledWith({
        where: { ...fields, product: { isActive: true } },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
          id: true,
          createdAt: true,
          product: { select: { id: true, name: true, imageUrl: true, price: true, buyLink: true } },
        },
      });
    });

    it("rejects an empty owner without touching the database", async () => {
      expect((await wishlistError(listWishlist({ userId: "" }))).code).toBe("INVALID_INPUT");
      expect(wishlistItem.findMany).not.toHaveBeenCalled();
    });

    it("turns database errors into DB_ERROR", async () => {
      wishlistItem.findMany.mockRejectedValue(new Error("timeout"));
      expect((await wishlistError(listWishlist(USER))).code).toBe("DB_ERROR");
    });
  });

  describe("claimAnonymousItems", () => {
    it("moves every item still under the anonymous id (with no user, null OR missing) to the user, in one update", async () => {
      wishlistItem.updateMany.mockResolvedValue({ count: 3 });
      await expect(claimAnonymousItems(ANON.anonymousId, "user_123")).resolves.toBe(3);
      expect(wishlistItem.updateMany).toHaveBeenCalledWith({
        where: { anonymousId: ANON.anonymousId, OR: [{ userId: null }, { userId: { isSet: false } }] },
        data: { userId: "user_123", anonymousId: null },
      });
    });

    it("returns 0 when there's nothing to move (e.g. a repeat call)", async () => {
      wishlistItem.updateMany.mockResolvedValue({ count: 0 });
      await expect(claimAnonymousItems(ANON.anonymousId, "user_123")).resolves.toBe(0);
    });

    it.each([
      ["an empty anonymous id", "", "user_123"],
      ["an empty user id", ANON.anonymousId, ""],
    ])("rejects %s without touching the database", async (_case, anonymousId, userId) => {
      expect((await wishlistError(claimAnonymousItems(anonymousId, userId))).code).toBe("INVALID_INPUT");
      expect(wishlistItem.updateMany).not.toHaveBeenCalled();
    });

    it("turns database errors into DB_ERROR", async () => {
      wishlistItem.updateMany.mockRejectedValue(new Error("timeout"));
      expect((await wishlistError(claimAnonymousItems(ANON.anonymousId, "user_123"))).code).toBe("DB_ERROR");
    });
  });
});
