"use server";

import { requireUser } from "@/lib/auth";
import { ImageUploadError, deleteImage, uploadImage } from "@/lib/cloudinary";
import { inngest, tryOnRequested } from "@/lib/inngest";
import { ProductError, getProduct } from "@/lib/products";
import { TryOnRecordError, createTryOn, failTryOn } from "@/lib/tryons";

// The "Try on" Server Action (docs/project-plan.md, "Try-on job lifecycle", step 1). The /tryon page
// (task 41) calls it. Per the Next 16 guide, it authenticates and validates on its own, and returns
// only what the UI needs.

export type TryOnFormState = { error: string | null; tryOnId: string | null };

// Not exported: a "use server" file may only export async functions (and types).
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PEOPLE_FOLDER = "mirror-ai/people";
const START_FAILED = "We couldn't start your try-on. Please try again.";

class FormError extends Error {}

function failed(error: string): TryOnFormState {
  return { error, tryOnId: null };
}

/** The chosen garment: a real ObjectId, for a product that exists and is shown to shoppers. */
async function readActiveProductId(formData: FormData): Promise<string> {
  const productId = formData.get("productId");
  if (typeof productId !== "string" || !/^[a-f0-9]{24}$/i.test(productId)) {
    throw new FormError("Please choose a garment to try on.");
  }
  const product = await getProduct(productId);
  if (!product || !product.isActive) throw new FormError("That garment isn't available any more.");
  return productId;
}

type Photo = { bytes: Buffer; type: "image/jpeg" | "image/png" | "image/webp" };

/** The real format, from the file's first bytes. `File.type` is only what the client claims. */
function sniffPhotoType(bytes: Buffer): Photo["type"] | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.subarray(0, 8).equals(PNG_SIGNATURE)) return "image/png";
  if (bytes.toString("latin1", 0, 4) === "RIFF" && bytes.toString("latin1", 8, 12) === "WEBP") return "image/webp";
  return null;
}

/** The person photo, checked before anything is uploaded. */
async function readPhoto(formData: FormData): Promise<Photo> {
  const photo = formData.get("photo");
  if (!(photo instanceof File) || photo.size === 0) throw new FormError("Please add a photo of yourself.");
  if (photo.size > MAX_PHOTO_BYTES) throw new FormError("The photo must be 5 MB or smaller.");
  const bytes = Buffer.from(await photo.arrayBuffer());
  const type = sniffPhotoType(bytes);
  if (!type) throw new FormError("The photo must be a JPEG, PNG or WebP image.");
  return { bytes, type };
}

/** Uploads the photo (without its metadata) and saves the PENDING row. Returns the new try-on's id. */
async function saveTryOn(userId: string, productId: string, photo: Photo): Promise<string> {
  const dataUri = `data:${photo.type};base64,${photo.bytes.toString("base64")}`;
  const uploaded = await uploadImage(dataUri, PEOPLE_FOLDER, { stripMetadata: true }); // no GPS in shared links
  try {
    const tryOn = await createTryOn({ userId, productId, personUrl: uploaded.url });
    return tryOn.id;
  } catch (error) {
    // No row points at the photo, so the 24 h cleanup could never find it: delete it now.
    await deleteImage(uploaded.publicId);
    throw error;
  }
}

function toFormState(error: unknown): TryOnFormState {
  if (
    error instanceof FormError ||
    error instanceof ProductError ||
    error instanceof ImageUploadError ||
    error instanceof TryOnRecordError
  ) {
    return failed(error.message);
  }
  console.error("[tryon] Unexpected error:", error);
  return failed("Something went wrong. Please try again.");
}

export async function createTryOnAction(_prev: TryOnFormState, formData: FormData): Promise<TryOnFormState> {
  const userId = await requireUser(); // from the session; redirects to sign-in when signed out

  let tryOnId: string;
  try {
    const photo = await readPhoto(formData); // photo checks first, before the database or Cloudinary
    const productId = await readActiveProductId(formData);
    tryOnId = await saveTryOn(userId, productId, photo);
  } catch (error) {
    return toFormState(error);
  }

  try {
    await inngest.send(tryOnRequested.create({ tryOnId }));
  } catch (error) {
    console.error("[tryon] Sending the try-on event failed:", error);
    // Keep the row (so the 24 h cleanup still deletes the photo), but don't leave it PENDING forever.
    // Only while still PENDING: if the event did get through, the job's newer status wins.
    await failTryOn(tryOnId, START_FAILED, ["PENDING"]).catch((failError: unknown) => {
      console.error("[tryon] Marking the try-on FAILED also failed:", failError);
    });
    return failed(START_FAILED);
  }

  return { error: null, tryOnId };
}
