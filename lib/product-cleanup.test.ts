// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The database, Cloudinary's delete and the row delete are mocked. The real publicIdFromUrl and ProductError
// are kept, because the cleanup relies on them.
const m = vi.hoisted(() => ({ updateMany: vi.fn(), findUnique: vi.fn(), deleteImage: vi.fn(), deleteProduct: vi.fn() }));
vi.mock("./prisma", () => ({ prisma: { product: { updateMany: m.updateMany, findUnique: m.findUnique } } }));
vi.mock("./cloudinary", async () => {
  const actual = await vi.importActual<typeof import("./cloudinary")>("./cloudinary");
  return { publicIdFromUrl: actual.publicIdFromUrl, deleteImage: m.deleteImage };
});
vi.mock("./products", async () => {
  const actual = await vi.importActual<typeof import("./products")>("./products");
  return { ProductError: actual.ProductError, deleteProduct: m.deleteProduct };
});

import { deleteProductAndImages } from "./product-cleanup";
import { ProductError } from "./products";

const ID = "65f0c0ffee0000000000beef";
const url = (publicId: string) => `https://res.cloudinary.com/demo/image/upload/v1712345678/${publicId}.jpg`;
const PRODUCT = {
  imageUrl: url("mirror-ai/garments/shirt"),
  tryOns: [
    { personUrl: url("mirror-ai/people/p1"), resultUrl: url("mirror-ai/results/r1") },
    { personUrl: url("mirror-ai/people/p2"), resultUrl: null }, // failed or unfinished try-on
  ],
};

async function productError(promise: Promise<unknown>): Promise<ProductError> {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ProductError);
  return error as ProductError;
}

describe("deleteProductAndImages", () => {
  beforeEach(() => {
    m.updateMany.mockResolvedValue({ count: 1 });
    m.findUnique.mockResolvedValue(PRODUCT);
    m.deleteImage.mockResolvedValue(true);
    m.deleteProduct.mockResolvedValue(undefined);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("hides the product FIRST, so no new try-on can start while it's being deleted", async () => {
    await deleteProductAndImages(ID);
    expect(m.updateMany).toHaveBeenCalledWith({ where: { id: ID }, data: { isActive: false } });
    expect(m.updateMany.mock.invocationCallOrder[0]).toBeLessThan(m.findUnique.mock.invocationCallOrder[0]);
  });

  it("deletes every try-on photo and the garment image BEFORE the product row", async () => {
    await expect(deleteProductAndImages(ID)).resolves.toBeUndefined();
    expect(m.findUnique).toHaveBeenCalledWith({
      where: { id: ID },
      select: { imageUrl: true, tryOns: { select: { personUrl: true, resultUrl: true } } },
    });
    expect(m.deleteImage.mock.calls.map(([id]) => id)).toEqual([
      "mirror-ai/people/p1",
      "mirror-ai/results/r1",
      "mirror-ai/people/p2",
      "mirror-ai/garments/shirt",
    ]);
    expect(m.deleteProduct).toHaveBeenCalledWith(ID);
    const lastImage = Math.max(...m.deleteImage.mock.invocationCallOrder);
    expect(lastImage).toBeLessThan(m.deleteProduct.mock.invocationCallOrder[0]);
  });

  it("deletes just the garment image and the row when the product has no try-ons", async () => {
    m.findUnique.mockResolvedValue({ ...PRODUCT, tryOns: [] });
    await deleteProductAndImages(ID);
    expect(m.deleteImage).toHaveBeenCalledTimes(1);
    expect(m.deleteProduct).toHaveBeenCalledWith(ID);
  });

  it("stops (keeping the garment and the row; the product stays hidden) if a try-on photo can't be deleted, and says to retry", async () => {
    m.deleteImage.mockImplementation(async (id: string) => id !== "mirror-ai/results/r1");
    const error = await productError(deleteProductAndImages(ID));
    expect(error.code).toBe("IMAGES_NOT_DELETED");
    expect(error.message).toBe(
      "We couldn't delete this product's try-on photos yet. It's hidden from shoppers now; please try deleting it again.",
    );
    expect(m.deleteImage).not.toHaveBeenCalledWith("mirror-ai/garments/shirt");
    expect(m.deleteProduct).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("1 try-on photo(s) of product"));
  });

  it("still deletes the product when only the garment image fails (it isn't personal), and logs it", async () => {
    m.deleteImage.mockImplementation(async (id: string) => id !== "mirror-ai/garments/shirt");
    await expect(deleteProductAndImages(ID)).resolves.toBeUndefined();
    expect(m.deleteProduct).toHaveBeenCalledWith(ID);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("garment image of product"));
  });

  it("never deletes an image outside its folder (e.g. a garment URL on a try-on), logs it, and carries on", async () => {
    m.findUnique.mockResolvedValue({
      imageUrl: "https://example.com/not-ours.jpg",
      tryOns: [{ personUrl: url("mirror-ai/garments/other"), resultUrl: null }],
    });
    await deleteProductAndImages(ID);
    expect(m.deleteImage).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith("[product-cleanup] Skipped a try-on image outside its folder.");
    expect(console.error).toHaveBeenCalledWith("[product-cleanup] Skipped a garment image outside its folder.");
    expect(m.deleteProduct).toHaveBeenCalledWith(ID);
  });

  it("deletes many photos a few at a time, and all of them", async () => {
    const tryOns = Array.from({ length: 12 }, (_, i) => ({ personUrl: url(`mirror-ai/people/p${i}`), resultUrl: null }));
    let running = 0;
    let most = 0;
    m.deleteImage.mockImplementation(async () => {
      running += 1;
      most = Math.max(most, running);
      await Promise.resolve();
      running -= 1;
      return true;
    });
    m.findUnique.mockResolvedValue({ ...PRODUCT, tryOns });
    await deleteProductAndImages(ID);
    expect(m.deleteImage).toHaveBeenCalledTimes(13); // 12 photos + the garment
    expect(most).toBeLessThanOrEqual(5);
  });

  it("rejects a malformed id without touching the database or Cloudinary", async () => {
    expect((await productError(deleteProductAndImages("nope"))).code).toBe("NOT_FOUND");
    expect(m.updateMany).not.toHaveBeenCalled();
    expect(m.findUnique).not.toHaveBeenCalled();
    expect(m.deleteImage).not.toHaveBeenCalled();
  });

  it("says NOT_FOUND for an unknown product, deleting nothing", async () => {
    m.findUnique.mockResolvedValue(null);
    expect((await productError(deleteProductAndImages(ID))).code).toBe("NOT_FOUND");
    expect(m.deleteImage).not.toHaveBeenCalled();
    expect(m.deleteProduct).not.toHaveBeenCalled();
  });

  it("turns a database error while loading into a friendly DB_ERROR, and logs it", async () => {
    const dbError = new Error("connection refused");
    m.findUnique.mockRejectedValue(dbError);
    const error = await productError(deleteProductAndImages(ID));
    expect(error.code).toBe("DB_ERROR");
    expect(console.error).toHaveBeenCalledWith("[product-cleanup] Hiding/loading the product failed:", dbError);
    expect(m.deleteImage).not.toHaveBeenCalled();
  });

  it("turns a database error while hiding the product into a friendly DB_ERROR, deleting nothing", async () => {
    m.updateMany.mockRejectedValue(new Error("connection refused"));
    expect((await productError(deleteProductAndImages(ID))).code).toBe("DB_ERROR");
    expect(m.findUnique).not.toHaveBeenCalled();
    expect(m.deleteImage).not.toHaveBeenCalled();
  });

  it("passes on the row delete's own error (e.g. already deleted in another tab)", async () => {
    m.deleteProduct.mockRejectedValue(new ProductError("NOT_FOUND", "That product doesn't exist."));
    expect((await productError(deleteProductAndImages(ID))).code).toBe("NOT_FOUND");
  });
});
