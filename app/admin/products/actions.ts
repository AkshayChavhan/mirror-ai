"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { ImageUploadError, uploadImage, uploadModel } from "@/lib/cloudinary";
import { GarmentModelError, MAX_MODEL_BYTES, MODEL_FOLDER, checkGarmentModel } from "@/lib/garment-model";
import { deleteGarmentModel, deleteProductAndImages } from "@/lib/product-cleanup";
import {
  ProductError,
  createProduct,
  getProduct,
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

/** Reads the non-file fields. Types are loose on purpose; lib/products validates them. */
function readFields(formData: FormData): Omit<ProductInput, "imageUrl" | "modelUrl"> {
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

/**
 * Reads and checks the chosen 3D model (task 67), if any, for a garment of `category`, WITHOUT uploading it:
 * a bad model is refused before anything (image or model) reaches Cloudinary. Returns its bytes.
 */
async function readChosenModel(formData: FormData, category: ProductInput["category"]): Promise<Uint8Array | undefined> {
  const file = formData.get("model");
  if (!(file instanceof File) || file.size === 0) return undefined;
  if (file.size > MAX_MODEL_BYTES) throw new FormError("The 3D model must be 5 MB or smaller.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  checkGarmentModel(bytes, category); // throws a GarmentModelError saying what's wrong and how to fix it
  return bytes;
}

function toFormState(error: unknown): ProductFormState {
  if (
    error instanceof FormError ||
    error instanceof ProductError ||
    error instanceof ImageUploadError ||
    error instanceof GarmentModelError
  ) {
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
  let uploadedModel: string | undefined;
  try {
    const fields = readFields(formData);
    validateProductInput(fields, true); // check fields first, so a typo doesn't leave an orphan image in Cloudinary
    const model = await readChosenModel(formData, fields.category); // also checked before any upload
    const imageUrl = await uploadChosenImage(formData, true);
    uploadedModel = model ? (await uploadModel(model, MODEL_FOLDER)).url : undefined;
    await createProduct({ ...fields, imageUrl: imageUrl as string, ...(uploadedModel ? { modelUrl: uploadedModel } : {}) });
  } catch (error) {
    if (uploadedModel) await deleteGarmentModel(uploadedModel); // not saved: don't leave it on Cloudinary
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
  let uploadedModel: string | undefined;
  let unusedModel: string | null = null; // the old model, once the product no longer points at it
  try {
    assertBoundId(id); // before any upload, so a bad id can't leave an orphan image
    const fields = readFields(formData);
    validateProductInput(fields, true); // check fields first, so a typo doesn't leave an orphan image in Cloudinary
    const model = await readChosenModel(formData, fields.category); // also checked before any upload
    const removeModel = !model && formData.get("removeModel") === "on"; // a newly chosen model wins
    const current = await getProduct(id); // its current model (to replace or keep) and category
    if (!current) throw new ProductError("NOT_FOUND", "That product doesn't exist.");
    if (current.modelUrl && !model && !removeModel && fields.category !== current.category) {
      throw new FormError(
        "This garment's 3D model was checked for its old category. To change the category, also choose a new 3D model, or tick \"Remove the 3D model\".",
      );
    }
    const imageUrl = await uploadChosenImage(formData, false);
    uploadedModel = model ? (await uploadModel(model, MODEL_FOLDER)).url : undefined;
    const modelChange = uploadedModel ? { modelUrl: uploadedModel } : removeModel ? { modelUrl: null } : {};
    await updateProduct(id, { ...fields, ...(imageUrl ? { imageUrl } : {}), ...modelChange });
    if (current.modelUrl && "modelUrl" in modelChange) unusedModel = current.modelUrl; // replaced or removed
  } catch (error) {
    if (uploadedModel) await deleteGarmentModel(uploadedModel); // not saved: don't leave it on Cloudinary
    return toFormState(error);
  }
  // Only after saving: delete the old model (best-effort; deleteGarmentModel logs failures and never throws).
  if (unusedModel) await deleteGarmentModel(unusedModel);
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
