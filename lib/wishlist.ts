import type { WishlistItem } from "@prisma/client";
import { prisma } from "./prisma";

// Server-only wishlist rows (docs/project-plan.md, "WishlistItem"). Each item belongs to a signed-in
// user (userId) OR an anonymous visitor (anonymousId, from lib/anonymous-id.ts). The caller works the
// owner out from the session or the cookie, never from user input. The same product may be saved twice.

export type WishlistOwner = { userId: string } | { anonymousId: string };

export type WishlistErrorCode = "INVALID_INPUT" | "LIMIT_REACHED" | "DB_ERROR";

/** The most items one owner can save (decided 2026-09-29). Only garments still shown to shoppers count, as on /wishlist. */
export const WISHLIST_ITEM_LIMIT = 100;

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

/**
 * Saves a product to the owner's wishlist, unless they already have WISHLIST_ITEM_LIMIT items. The caller
 * checks the product exists and is shown to shoppers.
 *
 * Save first, then count, and undo when over: if two saves race, each counts the other's row too, so racing
 * saves can't take the list over the limit (at worst both are refused, and a retry works). It's a limit on
 * saving, not a hard ceiling: moving signed-out items in after sign-in isn't capped, a garment shown again
 * counts again, and if the database fails mid-way the undo may not run (that's logged).
 */
export async function addWishlistItem(owner: WishlistOwner, productId: string): Promise<WishlistItem> {
  const fields = ownerFields(owner);
  if (!OBJECT_ID.test(productId)) throw new WishlistError("INVALID_INPUT", "That garment isn't available.");
  const item = await db("addWishlistItem", () => prisma.wishlistItem.create({ data: { ...fields, productId } }));
  if (await db("addWishlistItem", () => undoIfOverLimit(fields, item.id))) {
    throw new WishlistError("LIMIT_REACHED", `Your wishlist is full (${WISHLIST_ITEM_LIMIT} items). Remove some to save more.`);
  }
  return item;
}

/**
 * Counts the owner's items after a save and deletes the new one when over the limit. True when it did.
 * If the count fails, the new item is deleted too, so an error still means "nothing saved" and a retry
 * doesn't save a second copy.
 */
async function undoIfOverLimit(fields: { userId: string } | { anonymousId: string }, itemId: string): Promise<boolean> {
  let count: number;
  try {
    count = await prisma.wishlistItem.count({ where: { ...fields, product: { isActive: true } } });
  } catch (error) {
    await prisma.wishlistItem.deleteMany({ where: { id: itemId } }).catch((undoError: unknown) => {
      console.error("[wishlist] Undoing a save after a failed count also failed:", undoError);
    });
    throw error; // db() logs it and shows the friendly message
  }
  if (count <= WISHLIST_ITEM_LIMIT) return false;
  await prisma.wishlistItem.deleteMany({ where: { id: itemId } });
  return true;
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

/**
 * At most this many items on /wishlist (newest first). Saving stops at WISHLIST_ITEM_LIMIT, but moving
 * signed-out items to the account after sign-in keeps them all (nothing is lost): one move into an account
 * at or under the limit reaches at most twice the limit, so they all show. Only repeated moves can go
 * further; then the oldest appear as newer ones are removed. Saving works again once under the limit.
 */
const LIST_LIMIT = 2 * WISHLIST_ITEM_LIMIT;

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
