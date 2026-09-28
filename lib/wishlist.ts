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

/** One saved item on /wishlist: only what the page shows. */
export type WishlistEntry = {
  id: string;
  createdAt: Date;
  product: { id: string; name: string; imageUrl: string; price: number | null; buyLink: string | null };
};

/** At most this many items on /wishlist (a safety cap until task 57 limits how many can be saved). */
const LIST_LIMIT = 100;

/** The owner's saved items, newest first, for garments still shown to shoppers (hidden ones drop out). */
export async function listWishlist(owner: WishlistOwner): Promise<WishlistEntry[]> {
  const fields = ownerFields(owner);
  return db("listWishlist", () =>
    prisma.wishlistItem.findMany({
      where: { ...fields, product: { isActive: true } },
      orderBy: { createdAt: "desc" },
      take: LIST_LIMIT,
      select: {
        id: true,
        createdAt: true,
        product: { select: { id: true, name: true, imageUrl: true, price: true, buyLink: true } },
      },
    }),
  );
}

/**
 * Moves every item saved under an anonymous id to a signed-in user (after sign-in). One atomic update,
 * and only items still without a user. Returns how many moved (0 if there were none, or on a repeat call).
 */
export async function claimAnonymousItems(anonymousId: string, userId: string): Promise<number> {
  if (!anonymousId || !userId) throw new WishlistError("INVALID_INPUT", "We couldn't find your wishlist.");
  const { count } = await db("claimAnonymousItems", () =>
    prisma.wishlistItem.updateMany({
      // "No user yet": on MongoDB, Prisma treats a null field and a missing field differently, and an item
      // created without userId may have the field missing. Match both.
      where: { anonymousId, OR: [{ userId: null }, { userId: { isSet: false } }] },
      data: { userId, anonymousId: null },
    }),
  );
  return count;
}
