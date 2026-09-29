// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the database client: no MongoDB needed.
const { wishlistItem } = vi.hoisted(() => ({ wishlistItem: { create: vi.fn(), count: vi.fn(), deleteMany: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() } }));
vi.mock("./prisma", () => ({ prisma: { wishlistItem } }));

import {
  WishlistError,
  WISHLIST_ITEM_LIMIT,
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
    wishlistItem.count.mockReset();
    wishlistItem.deleteMany.mockReset();
    wishlistItem.findMany.mockReset();
    wishlistItem.updateMany.mockReset();
  });

  describe("addWishlistItem", () => {
    beforeEach(() => {
      wishlistItem.create.mockResolvedValue({ id: ITEM_ID });
      wishlistItem.count.mockResolvedValue(1); // the new item is the first one
    });

    it.each([
      ["a signed-in user", USER, { userId: "user_123" }],
      ["an anonymous visitor", ANON, { anonymousId: ANON.anonymousId }],
    ] as const)("saves the product for %s (only their own id column is set)", async (_case, owner, fields) => {
      await expect(addWishlistItem(owner, PRODUCT_ID)).resolves.toEqual({ id: ITEM_ID });
      expect(wishlistItem.create).toHaveBeenCalledWith({ data: { ...fields, productId: PRODUCT_ID } });
      // Then counts only this owner's items for garments still shown, like /wishlist does.
      expect(wishlistItem.count).toHaveBeenCalledWith({ where: { ...fields, product: { isActive: true } } });
      expect(wishlistItem.deleteMany).not.toHaveBeenCalled();
    });

    it("allows the 100th item (at the limit)", async () => {
      expect(WISHLIST_ITEM_LIMIT).toBe(100);
      wishlistItem.count.mockResolvedValue(100);
      await expect(addWishlistItem(USER, PRODUCT_ID)).resolves.toEqual({ id: ITEM_ID });
      expect(wishlistItem.deleteMany).not.toHaveBeenCalled();
    });

    it("refuses the 101st: undoes the save and says the list is full", async () => {
      wishlistItem.count.mockResolvedValue(101);
      wishlistItem.deleteMany.mockResolvedValue({ count: 1 });
      const error = await wishlistError(addWishlistItem(ANON, PRODUCT_ID));
      expect(error.code).toBe("LIMIT_REACHED");
      expect(error.message).toBe("Your wishlist is full (100 items). Remove some to save more.");
      expect(wishlistItem.deleteMany).toHaveBeenCalledWith({ where: { id: ITEM_ID } });
    });

    it("when the count fails, deletes the new item too (an error means nothing was saved) and says DB_ERROR", async () => {
      const countError = new Error("timeout");
      wishlistItem.count.mockRejectedValue(countError);
      wishlistItem.deleteMany.mockResolvedValue({ count: 1 });
      expect((await wishlistError(addWishlistItem(USER, PRODUCT_ID))).code).toBe("DB_ERROR");
      expect(wishlistItem.deleteMany).toHaveBeenCalledWith({ where: { id: ITEM_ID } });
      expect(console.error).toHaveBeenCalledWith("[wishlist] addWishlistItem failed:", countError);
    });

    it("when the count and that undo both fail, still says DB_ERROR and logs both", async () => {
      const countError = new Error("timeout");
      const undoError = new Error("still down");
      wishlistItem.count.mockRejectedValue(countError);
      wishlistItem.deleteMany.mockRejectedValue(undoError);
      expect((await wishlistError(addWishlistItem(USER, PRODUCT_ID))).code).toBe("DB_ERROR");
      expect(console.error).toHaveBeenCalledWith("[wishlist] Undoing a save after a failed count also failed:", undoError);
      expect(console.error).toHaveBeenCalledWith("[wishlist] addWishlistItem failed:", countError);
    });

    it("when over the limit but the undo fails, says DB_ERROR (not 'full') and logs it", async () => {
      const undoError = new Error("timeout");
      wishlistItem.count.mockResolvedValue(101);
      wishlistItem.deleteMany.mockRejectedValue(undoError);
      expect((await wishlistError(addWishlistItem(ANON, PRODUCT_ID))).code).toBe("DB_ERROR");
      expect(console.error).toHaveBeenCalledWith("[wishlist] addWishlistItem failed:", undoError);
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
        take: 2 * WISHLIST_ITEM_LIMIT, // a merge after sign-in can go over the limit; all stay removable
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
