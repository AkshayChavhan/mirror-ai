import type { WishlistItem } from "@prisma/client";
import { prisma } from "./prisma";

// Server-only wishlist rows (docs/project-plan.md, "WishlistItem"). Each item belongs to a signed-in
// user (userId) OR an anonymous visitor (anonymousId, from lib/anonymous-id.ts). The caller works the
// owner out from the session or the cookie, never from user input. The same product may be saved twice.

export type WishlistOwner = { userId: string } | { anonymousId: string };

export type WishlistErrorCode = "INVALID_INPUT" | "DB_ERROR";

/** Any wishlist row problem. `message` is safe to show users; details are logged on the server. */
export class WishlistError extends Error {
  constructor(
    public readonly code: WishlistErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "WishlistError";
  }
}

const OBJECT_ID = /^[a-f0-9]{24}$/i;

/** The owner's column as a filter/data object: exactly one of userId or anonymousId. */
function ownerFields(owner: WishlistOwner): { userId: string } | { anonymousId: string } {
  if ("userId" in owner && typeof owner.userId === "string" && owner.userId) return { userId: owner.userId };
  if ("anonymousId" in owner && typeof owner.anonymousId === "string" && owner.anonymousId) {
    return { anonymousId: owner.anonymousId };
  }
  throw new WishlistError("INVALID_INPUT", "We couldn't find your wishlist.");
}

async function db<T>(action: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    console.error(`[wishlist] ${action} failed:`, error);
    throw new WishlistError("DB_ERROR", "Something went wrong with your wishlist. Please try again.", {
      cause: error,
    });
  }
}

/** Saves a product to the owner's wishlist. The caller checks the product exists and is shown to shoppers. */
export async function addWishlistItem(owner: WishlistOwner, productId: string): Promise<WishlistItem> {
  const fields = ownerFields(owner);
  if (!OBJECT_ID.test(productId)) throw new WishlistError("INVALID_INPUT", "That garment isn't available.");
  return db("addWishlistItem", () => prisma.wishlistItem.create({ data: { ...fields, productId } }));
}

/**
 * Removes one item, but only if it belongs to this owner: the owner is part of the query, so nobody
 * can delete someone else's item. False when nothing matched.
 */
export async function removeWishlistItem(owner: WishlistOwner, itemId: string): Promise<boolean> {
  const fields = ownerFields(owner);
  if (!OBJECT_ID.test(itemId)) return false;
  const { count } = await db("removeWishlistItem", () =>
    prisma.wishlistItem.deleteMany({ where: { id: itemId, ...fields } }),
  );
  return count > 0;
}
