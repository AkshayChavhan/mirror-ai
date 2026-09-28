import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";

// Server-only: the anonymous visitor id that lets signed-out visitors keep a wishlist
// (docs/project-plan.md, "WishlistItem"). On sign-in, their items move to the account (task 50).
//
// The id works like a password for that wishlist, so the cookie is httpOnly (page scripts can't read
// it) and random (crypto.randomUUID, 122 random bits: it can't be guessed).

export const ANONYMOUS_ID_COOKIE = "mirror_anon_id";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;
// Lowercase only, exactly what randomUUID() makes (an uppercase copy would point to a different, empty list).
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/**
 * The visitor's anonymous id, or null if there's none. Works anywhere on the server, including while a
 * page renders. The cookie comes from the browser, so anything that isn't a UUID we could have made is ignored.
 */
export async function getAnonymousId(): Promise<string | null> {
  const value = (await cookies()).get(ANONYMOUS_ID_COOKIE)?.value;
  return value && UUID_V4.test(value) ? value : null;
}

/**
 * The visitor's anonymous id, creating it (and its cookie) if needed. Setting a cookie only works in a
 * Server Action or Route Handler, not while a page renders (Next 16 `cookies()` docs).
 */
export async function getOrCreateAnonymousId(): Promise<string> {
  const existing = await getAnonymousId();
  if (existing) return existing;

  const id = randomUUID();
  (await cookies()).set(ANONYMOUS_ID_COOKIE, id, {
    httpOnly: true, // page scripts (and any injected script) can't read it
    sameSite: "lax", // not sent on cross-site POSTs
    secure: process.env.NODE_ENV === "production", // HTTPS only when deployed (localhost is plain HTTP)
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
  });
  return id;
}

/** Deletes the anonymous id cookie (after its items moved to an account). Server Action or Route Handler only. */
export async function clearAnonymousId(): Promise<void> {
  (await cookies()).delete(ANONYMOUS_ID_COOKIE);
}
