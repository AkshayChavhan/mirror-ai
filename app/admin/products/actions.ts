"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { ImageUploadError, uploadImage } from "@/lib/cloudinary";
import { deleteProductAndImages } from "@/lib/product-cleanup";
import {
  ProductError,
  createProduct,
  updateProduct,
  validateProductInput,
  type ProductInput,
} from "@/lib/products";

// Server Actions for the admin product form. Per the Next 16 guide, every action authenticates and
// validates on its own: rendering the form only on an admin page is not a security boundary.

export type ProductFormState = { error: string | null };

// Not exported: a "use server" file may only export async functions (and types).
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const GARMENT_FOLDER = "mirror-ai/garments";

class FormError extends Error {}

/** A bound id comes back from the browser: check its type AND ObjectId format before using it. */
function assertBoundId(id: unknown): asserts id is string {
  if (typeof id !== "string" || !/^[a-f0-9]{24}$/i.test(id)) {
    throw new ProductError("NOT_FOUND", "That product doesn't exist.");
  }
}

function field(formData: FormData, name: string): string | null {
  const value = formData.get(name);
  return typeof value === "string" ? value : null;
}

/** Reads the non-image fields. Types are loose on purpose; lib/products validates them. */
function readFields(formData: FormData): Omit<ProductInput, "imageUrl"> {
  const priceText = field(formData, "price")?.trim() ?? "";
  return {
    name: field(formData, "name") ?? "",
    category: (field(formData, "category") ?? "") as ProductInput["category"],
    price: priceText === "" ? null : Number(priceText),
    description: field(formData, "description"),
    buyLink: field(formData, "buyLink"),
    isActive: formData.get("isActive") === "on",
  };
}

/** Uploads the chosen image (if any) and returns its URL. */
async function uploadChosenImage(formData: FormData, required: boolean): Promise<string | undefined> {
  const file = formData.get("image");
  const chosen = file instanceof File && file.size > 0;
  if (!chosen) {
    if (required) throw new FormError("Please choose a garment image.");
    return undefined;
  }
  if (!file.type.startsWith("image/")) throw new FormError("The garment image must be an image file.");
  if (file.size > MAX_IMAGE_BYTES) throw new FormError("The garment image must be 5 MB or smaller.");

  const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
  const { url } = await uploadImage(`data:${file.type};base64,${base64}`, GARMENT_FOLDER);
  return url;
}

function toFormState(error: unknown): ProductFormState {
  if (error instanceof FormError || error instanceof ProductError || error instanceof ImageUploadError) {
    return { error: error.message };
  }
  console.error("[admin/products] Unexpected error:", error);
  return { error: "Something went wrong. Please try again." };
}

export async function createProductAction(
  _prev: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  await requireAdmin();
  try {
    const fields = readFields(formData);
    validateProductInput(fields, true); // check fields first, so a typo doesn't leave an orphan image in Cloudinary
    const imageUrl = await uploadChosenImage(formData, true);
    await createProduct({ ...fields, imageUrl: imageUrl as string });
  } catch (error) {
    return toFormState(error);
  }
  revalidatePath("/admin/products");
  redirect("/admin/products");
}

export async function updateProductAction(
  id: string,
  _prev: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  await requireAdmin();
  try {
    assertBoundId(id); // before any upload, so a bad id can't leave an orphan image
    const fields = readFields(formData);
    validateProductInput(fields, true); // check fields first, so a typo doesn't leave an orphan image in Cloudinary
    const imageUrl = await uploadChosenImage(formData, false);
    await updateProduct(id, { ...fields, ...(imageUrl ? { imageUrl } : {}) });
  } catch (error) {
    return toFormState(error);
  }
  revalidatePath("/admin/products");
  redirect("/admin/products");
}

/** Permanently deletes a product with its images (its try-ons and wishlist items cascade). Admin only. */
export async function deleteProductAction(id: string): Promise<ProductFormState> {
  await requireAdmin();
  try {
    assertBoundId(id);
    await deleteProductAndImages(id); // photos first; if they can't all be deleted, the product is only hidden
  } catch (error) {
    // The product was hidden before the photos failed: refresh the list so the admin sees that.
    if (error instanceof ProductError && error.code === "IMAGES_NOT_DELETED") revalidatePath("/admin/products");
    return toFormState(error);
  }
  revalidatePath("/admin/products");
  return { error: null };
}

/** Hides (false) or shows (true) a product to shoppers without deleting it. Admin only. */
export async function setProductActiveAction(id: string, isActive: boolean): Promise<ProductFormState> {
  await requireAdmin();
  try {
    assertBoundId(id);
    if (typeof isActive !== "boolean") throw new FormError("Please choose whether the product is visible.");
    await updateProduct(id, { isActive });
  } catch (error) {
    return toFormState(error);
  }
  revalidatePath("/admin/products");
  return { error: null };
}
