import { deleteImage, publicIdFromUrl } from "./cloudinary";
import { prisma } from "./prisma";
import { ProductError, deleteProduct } from "./products";

// Server-only: deleting a product WITH its Cloudinary images. Deleting the row alone would cascade-delete its
// try-ons (prisma/schema.prisma, onDelete: Cascade), and their person photos and results would stay on
// Cloudinary forever, because the 24 h cleanup (lib/cleanup-job.ts) finds photos only through try-on rows.

const TRYON_FOLDERS = ["mirror-ai/people/", "mirror-ai/results/"];
const GARMENT_FOLDER = "mirror-ai/garments/";
const OBJECT_ID = /^[a-f0-9]{24}$/i;
const PARALLEL_DELETES = 5; // Cloudinary deletes at the same time (a product can have many try-ons)

/**
 * Deletes the image at `url` if it's one of ours in one of `folders`. True when it's gone (or isn't ours to
 * delete: a foreign URL is logged and skipped, never retried forever). False when Cloudinary failed.
 */
async function deleteOwnImage(url: string, folders: string[], what: string): Promise<boolean> {
  const publicId = publicIdFromUrl(url);
  if (!publicId || !folders.some((folder) => publicId.startsWith(folder))) {
    console.error(`[product-cleanup] Skipped a ${what} image outside its folder.`);
    return true;
  }
  return deleteImage(publicId); // never throws; "not found" counts as deleted
}

/** Deletes the try-on photos at `urls`, a few at a time. Returns how many couldn't be deleted. */
async function deleteTryOnPhotos(urls: string[]): Promise<number> {
  let failed = 0;
  for (let i = 0; i < urls.length; i += PARALLEL_DELETES) {
    const results = await Promise.all(
      urls.slice(i, i + PARALLEL_DELETES).map((url) => deleteOwnImage(url, TRYON_FOLDERS, "try-on")),
    );
    failed += results.filter((ok) => !ok).length;
  }
  return failed;
}

/**
 * Deletes a product: it hides it first (so no new try-on can start meanwhile), then deletes its try-ons'
 * photos (person + result), then its garment image, then the row (which cascades to its try-ons and
 * wishlist items). If any try-on photo can't be deleted, it stops there and throws, so the admin can retry:
 * rows must never disappear while their photos remain. The product then stays hidden, not deleted.
 */
export async function deleteProductAndImages(id: string): Promise<void> {
  if (!OBJECT_ID.test(id)) throw new ProductError("NOT_FOUND", "That product doesn't exist.");

  let product: { imageUrl: string; tryOns: { personUrl: string; resultUrl: string | null }[] } | null;
  try {
    // Hide it first: app/tryon/actions.ts refuses hidden products, so no new try-on can start once it's
    // hidden (a request already past its check can still finish; see the learning doc's Gotchas).
    await prisma.product.updateMany({ where: { id }, data: { isActive: false } });
    product = await prisma.product.findUnique({
      where: { id },
      select: { imageUrl: true, tryOns: { select: { personUrl: true, resultUrl: true } } },
    });
  } catch (error) {
    console.error("[product-cleanup] Hiding/loading the product failed:", error);
    throw new ProductError("DB_ERROR", "Something went wrong with the products. Please try again.", { cause: error });
  }
  if (!product) throw new ProductError("NOT_FOUND", "That product doesn't exist.");

  // 1. Try-on photos: personal data, so every one must be gone before any row is deleted.
  const photoUrls = product.tryOns.flatMap((t) => [t.personUrl, t.resultUrl]).filter((u): u is string => Boolean(u));
  const failed = await deleteTryOnPhotos(photoUrls);
  if (failed > 0) {
    console.error(`[product-cleanup] ${failed} try-on photo(s) of product ${id} couldn't be deleted; product kept (hidden).`);
    throw new ProductError(
      "IMAGES_NOT_DELETED",
      "We couldn't delete this product's try-on photos yet. It's hidden from shoppers now; please try deleting it again.",
    );
  }

  // 2. The garment image: not personal, so a failure is logged but doesn't block the delete.
  if (!(await deleteOwnImage(product.imageUrl, [GARMENT_FOLDER], "garment"))) {
    console.error(`[product-cleanup] The garment image of product ${id} couldn't be deleted.`);
  }

  // 3. The row, cascading to its try-ons and wishlist items.
  await deleteProduct(id);
}
