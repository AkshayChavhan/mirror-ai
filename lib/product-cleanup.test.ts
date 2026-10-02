// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The database, Cloudinary's delete and the row delete are mocked. The real publicIdFromUrl and ProductError
// are kept, because the cleanup relies on them.
const m = vi.hoisted(() => ({
  updateMany: vi.fn(),
  findUnique: vi.fn(),
  deleteImage: vi.fn(),
  deleteModel: vi.fn(),
  deleteProduct: vi.fn(),
}));
vi.mock("./prisma", () => ({ prisma: { product: { updateMany: m.updateMany, findUnique: m.findUnique } } }));
vi.mock("./cloudinary", async () => {
  const actual = await vi.importActual<typeof import("./cloudinary")>("./cloudinary");
  return {
    publicIdFromUrl: actual.publicIdFromUrl,
    modelPublicIdFromUrl: actual.modelPublicIdFromUrl,
    deleteImage: m.deleteImage,
    deleteModel: m.deleteModel,
  };
});
vi.mock("./products", async () => {
  const actual = await vi.importActual<typeof import("./products")>("./products");
  return { ProductError: actual.ProductError, deleteProduct: m.deleteProduct };
});

import { deleteGarmentModel, deleteProductAndImages } from "./product-cleanup";
import { ProductError } from "./products";

const ID = "65f0c0ffee0000000000beef";
const url = (publicId: string) => `https://res.cloudinary.com/demo/image/upload/v1712345678/${publicId}.jpg`;
const MODEL_URL = "https://res.cloudinary.com/demo/raw/upload/v1712345678/mirror-ai/models/shirt3d";
const PRODUCT = {
  imageUrl: url("mirror-ai/garments/shirt"),
  modelUrl: null as string | null, // no 3D model (task 67)
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
    m.deleteModel.mockResolvedValue(true);
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
      select: { imageUrl: true, modelUrl: true, tryOns: { select: { personUrl: true, resultUrl: true } } },
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
    expect(m.deleteModel).not.toHaveBeenCalled(); // no 3D model
  });

  it("deletes the garment's 3D model too (task 67), after the photos and before the row", async () => {
    m.findUnique.mockResolvedValue({ ...PRODUCT, modelUrl: MODEL_URL });
    await deleteProductAndImages(ID);
    expect(m.deleteModel).toHaveBeenCalledWith("mirror-ai/models/shirt3d");
    expect(Math.max(...m.deleteImage.mock.invocationCallOrder)).toBeLessThan(m.deleteModel.mock.invocationCallOrder[0]);
    expect(m.deleteModel.mock.invocationCallOrder[0]).toBeLessThan(m.deleteProduct.mock.invocationCallOrder[0]);
  });

  it("still deletes the product when only its 3D model fails (it isn't personal), and logs it", async () => {
    m.findUnique.mockResolvedValue({ ...PRODUCT, modelUrl: MODEL_URL });
    m.deleteModel.mockResolvedValue(false);
    await expect(deleteProductAndImages(ID)).resolves.toBeUndefined();
    expect(m.deleteProduct).toHaveBeenCalledWith(ID);
    expect(console.error).toHaveBeenCalledWith(`[product-cleanup] The 3D model of product ${ID} couldn't be deleted.`);
  });

  it("keeps the 3D model too when a try-on photo can't be deleted (the product stays, hidden)", async () => {
    m.findUnique.mockResolvedValue({ ...PRODUCT, modelUrl: MODEL_URL });
    m.deleteImage.mockImplementation(async (id: string) => id !== "mirror-ai/people/p2");
    await expect(deleteProductAndImages(ID)).rejects.toBeInstanceOf(ProductError);
    expect(m.deleteModel).not.toHaveBeenCalled();
    expect(m.deleteProduct).not.toHaveBeenCalled();
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

describe("deleteGarmentModel (task 67)", () => {
  beforeEach(() => {
    m.deleteModel.mockResolvedValue(true);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("deletes one of our models by its public id", async () => {
    await expect(deleteGarmentModel(MODEL_URL)).resolves.toBe(true);
    expect(m.deleteModel).toHaveBeenCalledWith("mirror-ai/models/shirt3d");
  });

  it("says when Cloudinary couldn't delete it", async () => {
    m.deleteModel.mockResolvedValue(false);
    await expect(deleteGarmentModel(MODEL_URL)).resolves.toBe(false);
  });

  it.each([
    ["another folder", "https://res.cloudinary.com/demo/raw/upload/v1/mirror-ai/people/p1"],
    ["a folder that only starts the same", "https://res.cloudinary.com/demo/raw/upload/v1/mirror-ai/models-old/m"],
    ["an image URL", url("mirror-ai/models/shirt3d")],
    ["another website", "https://example.com/raw/upload/mirror-ai/models/m"],
  ])("never deletes a file in %s: logs it and counts it as done", async (_case, other) => {
    await expect(deleteGarmentModel(other)).resolves.toBe(true);
    expect(m.deleteModel).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith("[product-cleanup] Skipped a 3D model outside its folder.");
  });
});
