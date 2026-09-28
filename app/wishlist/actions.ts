"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { getAnonymousId, getOrCreateAnonymousId } from "@/lib/anonymous-id";
import { ProductError, getProduct } from "@/lib/products";
import { WishlistError, addWishlistItem, removeWishlistItem, type WishlistOwner } from "@/lib/wishlist";

// Wishlist Server Actions. They work signed in OR signed out (decided): the owner is the Clerk user,
// or else the anonymous visitor id from the cookie. The owner is never taken from the caller's input.

export type WishlistActionState = { error: string | null };

function failed(error: unknown): WishlistActionState {
  if (error instanceof WishlistError || error instanceof ProductError) return { error: error.message };
  console.error("[wishlist] Unexpected error:", error);
  return { error: "Something went wrong. Please try again." };
}

/** Saves a garment. Signed out, this creates the anonymous id cookie if the visitor doesn't have one yet. */
export async function addToWishlistAction(productId: string): Promise<WishlistActionState> {
  try {
    if (typeof productId !== "string" || !/^[a-f0-9]{24}$/i.test(productId)) {
      return { error: "That garment isn't available." };
    }
    const product = await getProduct(productId);
    if (!product || !product.isActive) return { error: "That garment isn't available any more." };

    const { userId } = await auth();
    // Next 16 sets cookies only in Server Actions and Route Handlers (never while a page renders), so the
    // cookie is created here, and only after the checks above passed.
    const owner: WishlistOwner = userId ? { userId } : { anonymousId: await getOrCreateAnonymousId() };
    await addWishlistItem(owner, productId);
  } catch (error) {
    return failed(error);
  }
  revalidatePath("/wishlist");
  return { error: null };
}

/** Removes one saved item, only if it's the caller's own. Never creates a cookie. */
export async function removeFromWishlistAction(itemId: string): Promise<WishlistActionState> {
  try {
    if (typeof itemId !== "string") return { error: "That item isn't in your wishlist." };
    const { userId } = await auth();
    let owner: WishlistOwner;
    if (userId) {
      owner = { userId };
    } else {
      const anonymousId = await getAnonymousId();
      if (!anonymousId) return { error: "That item isn't in your wishlist." }; // no cookie: nothing saved
      owner = { anonymousId };
    }
    const removed = await removeWishlistItem(owner, itemId);
    if (!removed) return { error: "That item isn't in your wishlist." };
  } catch (error) {
    return failed(error);
  }
  revalidatePath("/wishlist");
  return { error: null };
}
