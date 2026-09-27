"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { ImageUploadError, uploadImage } from "@/lib/cloudinary";
import { ProductError, createProduct, updateProduct, validateProductInput, type ProductInput } from "@/lib/products";

// Server Actions for the admin product form. Per the Next 16 guide, every action authenticates and
// validates on its own: rendering the form only on an admin page is not a security boundary.

export type ProductFormState = { error: string | null };

// Not exported: a "use server" file may only export async functions (and types).
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const GARMENT_FOLDER = "mirror-ai/garments";

class FormError extends Error {}

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
    // The bound id comes back from the browser: don't trust its type.
    // Type AND format are checked before any upload, so a bad id can't leave an orphan image.
    if (typeof id !== "string" || !/^[a-f0-9]{24}$/i.test(id)) {
      throw new ProductError("NOT_FOUND", "That product doesn't exist.");
    }
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
