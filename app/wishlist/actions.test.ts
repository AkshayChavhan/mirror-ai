// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Everything outside the actions is mocked: Clerk, the anonymous-id cookie, products, the database, cache.
const m = vi.hoisted(() => ({
  auth: vi.fn(),
  getAnonymousId: vi.fn(),
  getOrCreateAnonymousId: vi.fn(),
  getProduct: vi.fn(),
  addWishlistItem: vi.fn(),
  removeWishlistItem: vi.fn(),
  revalidatePath: vi.fn(),
}));
vi.mock("@clerk/nextjs/server", () => ({ auth: m.auth }));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidatePath }));
vi.mock("@/lib/anonymous-id", () => ({
  getAnonymousId: m.getAnonymousId,
  getOrCreateAnonymousId: m.getOrCreateAnonymousId,
}));
vi.mock("@/lib/products", async () => {
  const actual = await vi.importActual<typeof import("@/lib/products")>("@/lib/products");
  return { ProductError: actual.ProductError, getProduct: m.getProduct };
});
vi.mock("@/lib/wishlist", async () => {
  const actual = await vi.importActual<typeof import("@/lib/wishlist")>("@/lib/wishlist");
  return { WishlistError: actual.WishlistError, addWishlistItem: m.addWishlistItem, removeWishlistItem: m.removeWishlistItem };
});

import { ProductError } from "@/lib/products";
import { WishlistError } from "@/lib/wishlist";
import { addToWishlistAction, removeFromWishlistAction } from "./actions";

const PRODUCT_ID = "65f0c0ffee0000000000beef";
const ITEM_ID = "65f0c0ffee0000000000abcd";
const ANON = "3f2b8c1e-9d4a-4b7e-8a21-5c6d7e8f9a0b";
const OK = { error: null };

describe("wishlist actions", () => {
  beforeEach(() => {
    m.auth.mockResolvedValue({ userId: null });
    m.getAnonymousId.mockResolvedValue(ANON);
    m.getOrCreateAnonymousId.mockResolvedValue(ANON);
    m.getProduct.mockResolvedValue({ id: PRODUCT_ID, isActive: true });
    m.addWishlistItem.mockResolvedValue({ id: ITEM_ID });
    m.removeWishlistItem.mockResolvedValue(true);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  describe("addToWishlistAction", () => {
    it("saves to the signed-in user's wishlist, without any anonymous cookie", async () => {
      m.auth.mockResolvedValue({ userId: "user_123" });
      await expect(addToWishlistAction(PRODUCT_ID)).resolves.toEqual(OK);
      expect(m.addWishlistItem).toHaveBeenCalledWith({ userId: "user_123" }, PRODUCT_ID);
      expect(m.getOrCreateAnonymousId).not.toHaveBeenCalled();
      expect(m.revalidatePath).toHaveBeenCalledWith("/wishlist");
    });

    it("signed out, saves under the anonymous id (creating the cookie if needed)", async () => {
      await expect(addToWishlistAction(PRODUCT_ID)).resolves.toEqual(OK);
      expect(m.getOrCreateAnonymousId).toHaveBeenCalled();
      expect(m.addWishlistItem).toHaveBeenCalledWith({ anonymousId: ANON }, PRODUCT_ID);
    });

    it.each([
      ["a malformed id", "../admin"],
      ["a non-string id", 42],
    ])("rejects %s before any lookup or cookie", async (_case, id) => {
      await expect(addToWishlistAction(id as string)).resolves.toEqual({ error: "That garment isn't available." });
      expect(m.getProduct).not.toHaveBeenCalled();
      expect(m.getOrCreateAnonymousId).not.toHaveBeenCalled();
    });

    it.each([
      ["an unknown", null],
      ["a hidden", { id: PRODUCT_ID, isActive: false }],
    ])("refuses %s product, without creating a cookie", async (_case, product) => {
      m.getProduct.mockResolvedValue(product);
      await expect(addToWishlistAction(PRODUCT_ID)).resolves.toEqual({ error: "That garment isn't available any more." });
      expect(m.addWishlistItem).not.toHaveBeenCalled();
      expect(m.getOrCreateAnonymousId).not.toHaveBeenCalled();
    });

    it("shows the friendly message when the product lookup fails", async () => {
      m.getProduct.mockRejectedValue(new ProductError("DB_ERROR", "Something went wrong with the products."));
      await expect(addToWishlistAction(PRODUCT_ID)).resolves.toEqual({ error: "Something went wrong with the products." });
    });

    it("shows the friendly message when saving fails, and doesn't refresh the page", async () => {
      m.addWishlistItem.mockRejectedValue(new WishlistError("DB_ERROR", "Something went wrong with your wishlist."));
      await expect(addToWishlistAction(PRODUCT_ID)).resolves.toEqual({ error: "Something went wrong with your wishlist." });
      expect(m.revalidatePath).not.toHaveBeenCalled();
    });

    it("hides unexpected errors behind a generic message and logs them", async () => {
      const bug = new TypeError("boom");
      m.auth.mockRejectedValue(bug);
      await expect(addToWishlistAction(PRODUCT_ID)).resolves.toEqual({ error: "Something went wrong. Please try again." });
      expect(console.error).toHaveBeenCalledWith("[wishlist] Unexpected error:", bug);
    });
  });

  describe("removeFromWishlistAction", () => {
    it("removes from the signed-in user's own wishlist", async () => {
      m.auth.mockResolvedValue({ userId: "user_123" });
      await expect(removeFromWishlistAction(ITEM_ID)).resolves.toEqual(OK);
      expect(m.removeWishlistItem).toHaveBeenCalledWith({ userId: "user_123" }, ITEM_ID);
      expect(m.getAnonymousId).not.toHaveBeenCalled();
      expect(m.revalidatePath).toHaveBeenCalledWith("/wishlist");
    });

    it("signed out, removes from the anonymous wishlist, and never creates a cookie", async () => {
      await expect(removeFromWishlistAction(ITEM_ID)).resolves.toEqual(OK);
      expect(m.removeWishlistItem).toHaveBeenCalledWith({ anonymousId: ANON }, ITEM_ID);
      expect(m.getOrCreateAnonymousId).not.toHaveBeenCalled();
    });

    it("signed out with no cookie, there's nothing to remove", async () => {
      m.getAnonymousId.mockResolvedValue(null);
      await expect(removeFromWishlistAction(ITEM_ID)).resolves.toEqual({ error: "That item isn't in your wishlist." });
      expect(m.removeWishlistItem).not.toHaveBeenCalled();
    });

    it("says so when the item isn't the caller's (or doesn't exist)", async () => {
      m.removeWishlistItem.mockResolvedValue(false);
      await expect(removeFromWishlistAction(ITEM_ID)).resolves.toEqual({ error: "That item isn't in your wishlist." });
      expect(m.revalidatePath).not.toHaveBeenCalled();
    });

    it("rejects a non-string id", async () => {
      await expect(removeFromWishlistAction(42 as unknown as string)).resolves.toEqual({
        error: "That item isn't in your wishlist.",
      });
      expect(m.removeWishlistItem).not.toHaveBeenCalled();
    });

    it("shows the friendly message when removing fails", async () => {
      m.removeWishlistItem.mockRejectedValue(new WishlistError("DB_ERROR", "Something went wrong with your wishlist."));
      await expect(removeFromWishlistAction(ITEM_ID)).resolves.toEqual({ error: "Something went wrong with your wishlist." });
    });
  });
});
