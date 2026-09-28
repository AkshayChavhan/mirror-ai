import { randomBytes } from "node:crypto";
import { Prisma, TryOnStatus, type Category, type TryOn } from "@prisma/client";
import { prisma } from "./prisma";

// Server-only try-on rows in the database (docs/project-plan.md, "TryOn" and "Try-on job lifecycle").
// Calling the try-on model is lib/tryon.ts. Auth happens in the caller (requireUser()): userId must
// come from the session, never from a form.

export type TryOnRecordErrorCode = "INVALID_INPUT" | "NOT_FOUND" | "DB_ERROR";

/** Any try-on row problem. `message` is safe to show users; details are logged on the server. */
export class TryOnRecordError extends Error {
  constructor(
    public readonly code: TryOnRecordErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "TryOnRecordError";
  }
}

export type NewTryOn = {
  userId: string;
  productId: string;
  personUrl: string;
};

const OBJECT_ID = /^[a-f0-9]{24}$/i;
/** A share token: 16 random bytes in base64url, always 22 characters (an ObjectId never matches). */
const SHARE_ID = /^[A-Za-z0-9_-]{22}$/;

/** A new share token for the public result link: 128 random bits, so it can't be guessed. */
function newShareId(): string {
  return randomBytes(16).toString("base64url");
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function invalid(message: string): never {
  throw new TryOnRecordError("INVALID_INPUT", message);
}

/** Runs a database call, turning Prisma errors into friendly TryOnRecordErrors. */
async function db<T>(action: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      throw new TryOnRecordError("NOT_FOUND", "That try-on doesn't exist.", { cause: error });
    }
    console.error(`[tryons] ${action} failed:`, error);
    throw new TryOnRecordError("DB_ERROR", "Something went wrong saving your try-on. Please try again.", {
      cause: error,
    });
  }
}

/** Saves a new try-on as PENDING (lifecycle step 1). Types are checked at runtime too. */
export async function createTryOn(input: NewTryOn): Promise<TryOn> {
  const { userId, productId, personUrl }: Record<keyof NewTryOn, unknown> = input;
  if (typeof userId !== "string" || !userId.trim()) invalid("Please sign in to try garments on.");
  if (typeof productId !== "string" || !OBJECT_ID.test(productId)) invalid("That garment isn't available.");
  if (typeof personUrl !== "string" || !isHttpsUrl(personUrl)) invalid("Please add a photo of yourself.");

  return db("createTryOn", () =>
    prisma.tryOn.create({
      data: { userId, productId, personUrl, status: TryOnStatus.PENDING, shareId: newShareId() },
    }),
  );
}

/** What the job needs to run the model for one try-on. */
export type ClaimedTryOn = {
  personUrl: string;
  garmentUrl: string;
  category: Category;
};

/** Runs an update that only matches when the row is in the expected status: "no match" becomes null. */
async function ifStatusMatches<T>(action: string, run: () => Promise<T>): Promise<T | null> {
  try {
    return await db(action, run);
  } catch (error) {
    if (error instanceof TryOnRecordError && error.code === "NOT_FOUND") return null;
    throw error;
  }
}

/**
 * Moves a PENDING try-on to PROCESSING (lifecycle step 2) in ONE atomic update, so a duplicate
 * event can't run the model twice. Returns null when the row is gone or no longer PENDING.
 */
export async function claimTryOn(id: string): Promise<ClaimedTryOn | null> {
  if (!OBJECT_ID.test(id)) return null;
  const row = await ifStatusMatches("claimTryOn", () =>
    prisma.tryOn.update({
      where: { id, status: TryOnStatus.PENDING },
      data: { status: TryOnStatus.PROCESSING },
      select: { personUrl: true, product: { select: { imageUrl: true, category: true } } },
    }),
  );
  return row && { personUrl: row.personUrl, garmentUrl: row.product.imageUrl, category: row.product.category };
}

/** Saves the result and marks the try-on DONE (lifecycle step 3). False when it's gone or no longer PROCESSING. */
export async function completeTryOn(id: string, resultUrl: string): Promise<boolean> {
  if (!isHttpsUrl(resultUrl)) invalid("The try-on result is missing.");
  if (!OBJECT_ID.test(id)) return false;
  const row = await ifStatusMatches("completeTryOn", () =>
    prisma.tryOn.update({
      where: { id, status: TryOnStatus.PROCESSING },
      data: { status: TryOnStatus.DONE, resultUrl },
      select: { id: true },
    }),
  );
  return row !== null;
}

/**
 * Marks a try-on FAILED (lifecycle step 4), but only while it's in one of `from`, so a late failure
 * can never overwrite a newer status (e.g. a DONE try-on). False when nothing matched.
 * `errorMessage` must be safe to show the user (never a provider error).
 */
export async function failTryOn(id: string, errorMessage: string, from: TryOnStatus[]): Promise<boolean> {
  if (!OBJECT_ID.test(id)) return false;
  const { count } = await db("failTryOn", () =>
    prisma.tryOn.updateMany({
      where: { id, status: { in: from } },
      data: { status: TryOnStatus.FAILED, errorMessage },
    }),
  );
  return count > 0;
}

/** Try-ons (and their photos) live for 24 h (docs/project-plan.md, "Privacy"). */
export const TRYON_TTL_MS = 24 * 60 * 60 * 1000;

/** Only what the loading screen needs: the status, and when done, the result and its share token. */
export type TryOnStatusView = {
  status: TryOnStatus;
  resultUrl: string | null;
  errorMessage: string | null;
  shareId: string;
};

/**
 * One try-on's status for its OWNER, or null when it doesn't exist, belongs to someone else, or is
 * older than 24 h (in case the cleanup job runs late). All three look the same to the caller.
 */
export async function getTryOnStatus(id: string, userId: string): Promise<TryOnStatusView | null> {
  if (!OBJECT_ID.test(id) || !userId) return null;
  return db("getTryOnStatus", () =>
    prisma.tryOn.findFirst({
      where: { id, userId, createdAt: { gt: new Date(Date.now() - TRYON_TTL_MS) } },
      select: { status: true, resultUrl: true, errorMessage: true, shareId: true },
    }),
  );
}

/** One row of the /history page: only what it shows. */
export type RecentTryOn = {
  id: string;
  status: TryOnStatus;
  resultUrl: string | null;
  errorMessage: string | null;
  createdAt: Date;
  product: { name: string };
};

/** At most this many rows on /history (a safety cap; the 24 h window keeps the list short anyway). */
const RECENT_LIMIT = 50;

/** The user's try-ons from the last 24 h, newest first. Older ones stay hidden even if the cleanup runs late. */
export async function listRecentTryOns(userId: string): Promise<RecentTryOn[]> {
  if (!userId) return [];
  return db("listRecentTryOns", () =>
    prisma.tryOn.findMany({
      where: { userId, createdAt: { gt: new Date(Date.now() - TRYON_TTL_MS) } },
      orderBy: { createdAt: "desc" },
      take: RECENT_LIMIT,
      select: {
        id: true,
        status: true,
        resultUrl: true,
        errorMessage: true,
        createdAt: true,
        product: { select: { name: true } },
      },
    }),
  );
}

/** An expired try-on, with just what the cleanup job needs to delete its images. */
export type ExpiredTryOn = { id: string; personUrl: string; resultUrl: string | null };

/** Up to `limit` try-ons older than 24 h, oldest first (for the cleanup job, across all users). */
export async function listExpiredTryOns(limit: number): Promise<ExpiredTryOn[]> {
  return db("listExpiredTryOns", () =>
    prisma.tryOn.findMany({
      where: { createdAt: { lte: new Date(Date.now() - TRYON_TTL_MS) } },
      orderBy: { createdAt: "asc" },
      take: limit,
      select: { id: true, personUrl: true, resultUrl: true },
    }),
  );
}

/** Deletes try-on rows by id (the cleanup job calls it only after their images are gone). Returns how many. */
export async function deleteTryOns(ids: string[]): Promise<number> {
  const valid = ids.filter((id) => OBJECT_ID.test(id));
  if (valid.length === 0) return 0;
  const { count } = await db("deleteTryOns", () => prisma.tryOn.deleteMany({ where: { id: { in: valid } } }));
  return count;
}

/** What the public result page (task 44) may show to anyone with the link. */
export type SharedTryOn = {
  status: TryOnStatus;
  personUrl: string;
  resultUrl: string | null;
  createdAt: Date;
  product: { name: string };
};

/**
 * A try-on by its share token, for the public link /tryon/[shareId], or null. Only a real share token
 * works: an ObjectId (or anything else) is rejected without a database call, so ids can't be guessed.
 * Older than 24 h counts as gone, even if the cleanup job runs late.
 */
export async function getSharedTryOn(shareId: string): Promise<SharedTryOn | null> {
  if (!SHARE_ID.test(shareId)) return null;
  return db("getSharedTryOn", () =>
    prisma.tryOn.findFirst({
      where: { shareId, createdAt: { gt: new Date(Date.now() - TRYON_TTL_MS) } },
      select: { status: true, personUrl: true, resultUrl: true, createdAt: true, product: { select: { name: true } } },
    }),
  );
}
