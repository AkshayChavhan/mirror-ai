import { Prisma, TryOnStatus, type TryOn } from "@prisma/client";
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
    prisma.tryOn.create({ data: { userId, productId, personUrl, status: TryOnStatus.PENDING } }),
  );
}

/** Marks a try-on FAILED. `errorMessage` must be safe to show the user (never a provider error). */
export async function failTryOn(id: string, errorMessage: string): Promise<void> {
  if (!OBJECT_ID.test(id)) throw new TryOnRecordError("NOT_FOUND", "That try-on doesn't exist.");
  await db("failTryOn", () =>
    prisma.tryOn.update({ where: { id }, data: { status: TryOnStatus.FAILED, errorMessage } }),
  );
}
