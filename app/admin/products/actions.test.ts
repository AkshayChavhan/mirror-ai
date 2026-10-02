// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Everything outside the action is mocked: auth, Cloudinary, the database, and Next's redirect/cache.
// The 3D model check (lib/garment-model.ts) has its own tests; here each test says what it finds.
const m = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  uploadImage: vi.fn(),
  deleteImage: vi.fn(),
  uploadModel: vi.fn(),
  checkGarmentModel: vi.fn(),
  createProduct: vi.fn(),
  getProduct: vi.fn(),
  updateProduct: vi.fn(),
  deleteProductAndImages: vi.fn(),
  deleteGarmentModel: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));
vi.mock("@/lib/auth", () => ({ requireAdmin: m.requireAdmin }));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: m.redirect }));
vi.mock("@/lib/cloudinary", async () => {
  const actual = await vi.importActual<typeof import("@/lib/cloudinary")>("@/lib/cloudinary");
  return {
    ImageUploadError: actual.ImageUploadError,
    uploadImage: m.uploadImage,
    deleteImage: m.deleteImage,
    uploadModel: m.uploadModel,
  };
});
vi.mock("@/lib/garment-model", async () => {
  const actual = await vi.importActual<typeof import("@/lib/garment-model")>("@/lib/garment-model");
  return { ...actual, checkGarmentModel: m.checkGarmentModel };
});
vi.mock("@/lib/products", async () => {
  const actual = await vi.importActual<typeof import("@/lib/products")>("@/lib/products");
  return {
    ProductError: actual.ProductError,
    validateProductInput: actual.validateProductInput, // real validation, so field checks are tested
    createProduct: m.createProduct,
    getProduct: m.getProduct,
    updateProduct: m.updateProduct,
  };
});

vi.mock("@/lib/product-cleanup", () => ({
  deleteProductAndImages: m.deleteProductAndImages,
  deleteGarmentModel: m.deleteGarmentModel,
}));

import { ImageUploadError } from "@/lib/cloudinary";
import { GarmentModelError } from "@/lib/garment-model";
import { ProductError } from "@/lib/products";
import {
  createProductAction,
  deleteProductAction,
  setProductActiveAction,
  updateProductAction,
} from "./actions";

const ID = "65f0c0ffee0000000000abcd";
const UPLOADED = "https://res.cloudinary.com/demo/image/upload/mirror-ai/garments/abc.png";
const EMPTY = { error: null };
const NEW_MODEL = "https://res.cloudinary.com/demo/raw/upload/v2/mirror-ai/models/new";
const OLD_MODEL = "https://res.cloudinary.com/demo/raw/upload/v1/mirror-ai/models/old";
const GLB_BYTES = [0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0]; // starts like a .glb; the check itself is mocked
const glbFile = () => new File([new Uint8Array(GLB_BYTES)], "shirt.glb", { type: "model/gltf-binary" });

function form(overrides: Record<string, string | File | null> = {}): FormData {
  const values: Record<string, string | File | null> = {
    name: "Linen Shirt",
    category: "UPPER",
    price: "29.99",
    description: "Summer shirt",
    buyLink: "https://shop.example.com/shirt",
    isActive: "on",
    image: new File([new Uint8Array([137, 80, 78, 71])], "shirt.png", { type: "image/png" }),
    ...overrides,
  };
  const fd = new FormData();
  for (const [key, value] of Object.entries(values)) if (value !== null) fd.append(key, value);
  return fd;
}

describe("admin product actions", () => {
  beforeEach(() => {
    m.requireAdmin.mockResolvedValue("user_admin");
    m.uploadImage.mockResolvedValue({ url: UPLOADED, publicId: "mirror-ai/garments/abc", width: 800, height: 1200 });
    m.deleteImage.mockResolvedValue(true);
    m.createProduct.mockResolvedValue({ id: ID });
    m.updateProduct.mockResolvedValue({ id: ID });
    m.getProduct.mockResolvedValue({ id: ID, category: "UPPER", modelUrl: null });
    m.uploadModel.mockResolvedValue({ url: NEW_MODEL, publicId: "mirror-ai/models/new" });
    m.deleteGarmentModel.mockResolvedValue(true);
    m.checkGarmentModel.mockImplementation(() => {}); // a good model (a test may make it throw)
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  describe("createProductAction", () => {
    it("checks admin access before anything else", async () => {
      m.requireAdmin.mockRejectedValue(new Error("NEXT_NOT_FOUND"));
      await expect(createProductAction(EMPTY, form())).rejects.toThrow("NEXT_NOT_FOUND");
      expect(m.uploadImage).not.toHaveBeenCalled();
      expect(m.createProduct).not.toHaveBeenCalled();
    });

    it("uploads the image, saves the product, and returns to the list", async () => {
      await expect(createProductAction(EMPTY, form())).rejects.toThrow("NEXT_REDIRECT:/admin/products");
      expect(m.uploadImage).toHaveBeenCalledWith(expect.stringMatching(/^data:image\/png;base64,/), "mirror-ai/garments");
      expect(m.createProduct).toHaveBeenCalledWith({
        name: "Linen Shirt",
        category: "UPPER",
        price: 29.99,
        description: "Summer shirt",
        buyLink: "https://shop.example.com/shirt",
        isActive: true,
        imageUrl: UPLOADED,
      });
      expect(m.revalidatePath).toHaveBeenCalledWith("/admin/products");
    });

    it("treats an empty price as no price and an unticked box as hidden", async () => {
      await expect(createProductAction(EMPTY, form({ price: "", isActive: null }))).rejects.toThrow("NEXT_REDIRECT");
      expect(m.createProduct).toHaveBeenCalledWith(expect.objectContaining({ price: null, isActive: false }));
    });

    it.each([
      ["no image", { image: null }, "Please choose a garment image."],
      ["an empty file", { image: new File([], "empty.png", { type: "image/png" }) }, "Please choose a garment image."],
      ["a non-image file", { image: new File(["hi"], "notes.txt", { type: "text/plain" }) }, "must be an image file"],
      [
        "a file over 5 MB",
        { image: new File([new Uint8Array(5 * 1024 * 1024 + 1)], "big.png", { type: "image/png" }) },
        "5 MB or smaller",
      ],
    ])("rejects %s without uploading", async (_label, overrides, message) => {
      const state = await createProductAction(EMPTY, form(overrides));
      expect(state.error).toContain(message);
      expect(m.uploadImage).not.toHaveBeenCalled();
      expect(m.createProduct).not.toHaveBeenCalled();
    });

    it("rejects invalid fields BEFORE uploading (no orphan image in Cloudinary)", async () => {
      await expect(createProductAction(EMPTY, form({ name: "" }))).resolves.toEqual({
        error: "Please enter a product name.",
      });
      expect(m.uploadImage).not.toHaveBeenCalled();
      expect(m.createProduct).not.toHaveBeenCalled();
    });

    it("shows a validation message raised while saving", async () => {
      m.createProduct.mockRejectedValue(new ProductError("INVALID_INPUT", "Please add a product image."));
      await expect(createProductAction(EMPTY, form())).resolves.toEqual({ error: "Please add a product image." });
    });

    it("shows the upload message from lib/cloudinary", async () => {
      m.uploadImage.mockRejectedValue(new ImageUploadError("We couldn't upload your image. Please try again."));
      await expect(createProductAction(EMPTY, form())).resolves.toEqual({
        error: "We couldn't upload your image. Please try again.",
      });
    });

    it("hides unexpected errors behind a generic message and logs them", async () => {
      const boom = new Error("stack trace with secrets");
      m.createProduct.mockRejectedValue(boom);
      const state = await createProductAction(EMPTY, form());
      expect(state.error).toBe("Something went wrong. Please try again.");
      expect(console.error).toHaveBeenCalledWith("[admin/products] Unexpected error:", boom);
    });
  });

  describe("updateProductAction", () => {
    it("checks admin access before anything else", async () => {
      m.requireAdmin.mockRejectedValue(new Error("NEXT_NOT_FOUND"));
      await expect(updateProductAction(ID, EMPTY, form())).rejects.toThrow("NEXT_NOT_FOUND");
      expect(m.updateProduct).not.toHaveBeenCalled();
    });

    it("keeps the current image when no new one is chosen", async () => {
      await expect(updateProductAction(ID, EMPTY, form({ image: null }))).rejects.toThrow("NEXT_REDIRECT");
      expect(m.uploadImage).not.toHaveBeenCalled();
      expect(m.updateProduct).toHaveBeenCalledWith(ID, expect.not.objectContaining({ imageUrl: expect.anything() }));
    });

    it("uploads and saves a replacement image", async () => {
      await expect(updateProductAction(ID, EMPTY, form())).rejects.toThrow("NEXT_REDIRECT");
      expect(m.updateProduct).toHaveBeenCalledWith(ID, expect.objectContaining({ imageUrl: UPLOADED }));
    });

    it.each([
      ["a non-string id", ["65f0c0ffee0000000000abcd"] as unknown as string],
      ["a malformed id", "not-an-object-id"],
    ])("rejects %s sent back from the browser, before any upload", async (_label, tampered) => {
      await expect(updateProductAction(tampered, EMPTY, form())).resolves.toEqual({
        error: "That product doesn't exist.",
      });
      expect(m.uploadImage).not.toHaveBeenCalled();
      expect(m.updateProduct).not.toHaveBeenCalled();
    });

    it("rejects invalid fields before uploading a replacement image", async () => {
      const state = await updateProductAction(ID, EMPTY, form({ category: "SHOES" }));
      expect(state.error).toBe("Please choose a category.");
      expect(m.uploadImage).not.toHaveBeenCalled();
    });

    it("shows NOT_FOUND from lib/products", async () => {
      m.updateProduct.mockRejectedValue(new ProductError("NOT_FOUND", "That product doesn't exist."));
      await expect(updateProductAction(ID, EMPTY, form({ image: null }))).resolves.toEqual({
        error: "That product doesn't exist.",
      });
    });
  });

  describe("minimum garment image size (task 68)", () => {
    const uploadedSize = (width: number, height: number) =>
      m.uploadImage.mockResolvedValue({ url: UPLOADED, publicId: "mirror-ai/garments/abc", width, height });

    it.each([
      ["too narrow", 511, 800],
      ["too short", 800, 511],
      ["tiny (the 161×148 that gave a poor try-on)", 161, 148],
    ])("refuses an image that's %s, saying its size, and deletes the upload", async (_case, width, height) => {
      uploadedSize(width, height);
      const state = await createProductAction(EMPTY, form());
      expect(state.error).toBe(
        `The garment image must be at least 512 × 512 pixels (this one is ${width} × ${height}). Small images give poor try-ons.`,
      );
      expect(m.deleteImage).toHaveBeenCalledWith("mirror-ai/garments/abc");
      expect(m.createProduct).not.toHaveBeenCalled();
    });

    it.each([
      ["exactly 512 × 512", 512, 512],
      ["just over", 513, 2000],
    ])("accepts an image %s", async (_case, width, height) => {
      uploadedSize(width, height);
      await expect(createProductAction(EMPTY, form())).rejects.toThrow("NEXT_REDIRECT");
      expect(m.deleteImage).not.toHaveBeenCalled();
      expect(m.createProduct).toHaveBeenCalledWith(expect.objectContaining({ imageUrl: UPLOADED }));
    });

    it("refuses a too-small replacement image on edit, keeping the product as it was", async () => {
      uploadedSize(300, 300);
      const state = await updateProductAction(ID, EMPTY, form());
      expect(state.error).toContain("at least 512 × 512 pixels (this one is 300 × 300)");
      expect(m.deleteImage).toHaveBeenCalledWith("mirror-ai/garments/abc");
      expect(m.updateProduct).not.toHaveBeenCalled();
    });

    it("refuses it before the 3D model is uploaded (no orphan model either), on create and edit", async () => {
      uploadedSize(100, 100);
      const glb = () => new File([new Uint8Array([0x67, 0x6c, 0x54, 0x46])], "shirt.glb", { type: "model/gltf-binary" });
      for (const run of [() => createProductAction(EMPTY, form({ model: glb() })), () => updateProductAction(ID, EMPTY, form({ model: glb() }))]) {
        expect((await run()).error).toContain("at least 512 × 512 pixels (this one is 100 × 100)");
      }
      expect(m.uploadModel).not.toHaveBeenCalled();
    });

    it("still gives the size message when deleting the refused upload fails (deleteImage logs it)", async () => {
      uploadedSize(200, 900);
      m.deleteImage.mockResolvedValue(false);
      const state = await createProductAction(EMPTY, form());
      expect(state.error).toContain("at least 512 × 512 pixels (this one is 200 × 900)");
      expect(m.createProduct).not.toHaveBeenCalled();
    });
  });

  describe("3D models (task 67)", () => {
    it("create: checks the chosen model for the garment's category, uploads it, and saves its address", async () => {
      await expect(createProductAction(EMPTY, form({ category: "LOWER", model: glbFile() }))).rejects.toThrow("NEXT_REDIRECT");
      const [checked, category] = m.checkGarmentModel.mock.calls[0] as [Uint8Array, string];
      expect([...checked]).toEqual(GLB_BYTES);
      expect(category).toBe("LOWER");
      expect(m.uploadModel).toHaveBeenCalledWith(expect.any(Uint8Array), "mirror-ai/models");
      expect(m.createProduct).toHaveBeenCalledWith(expect.objectContaining({ imageUrl: UPLOADED, modelUrl: NEW_MODEL }));
    });

    it("create: no model chosen means nothing extra is uploaded or saved", async () => {
      await expect(createProductAction(EMPTY, form({ model: new File([], "") }))).rejects.toThrow("NEXT_REDIRECT");
      expect(m.checkGarmentModel).not.toHaveBeenCalled();
      expect(m.uploadModel).not.toHaveBeenCalled();
      expect(m.createProduct).toHaveBeenCalledWith(expect.not.objectContaining({ modelUrl: expect.anything() }));
    });

    it("refuses a bad model with its message BEFORE any upload (no image or model reaches Cloudinary)", async () => {
      m.checkGarmentModel.mockImplementation(() => {
        throw new GarmentModelError("The 3D model has no rigged (skinned) mesh.");
      });
      for (const run of [() => createProductAction(EMPTY, form({ model: glbFile() })), () => updateProductAction(ID, EMPTY, form({ model: glbFile() }))]) {
        await expect(run()).resolves.toEqual({ error: "The 3D model has no rigged (skinned) mesh." });
      }
      expect(m.uploadImage).not.toHaveBeenCalled();
      expect(m.uploadModel).not.toHaveBeenCalled();
      expect(m.createProduct).not.toHaveBeenCalled();
      expect(m.updateProduct).not.toHaveBeenCalled();
    });

    it("refuses a model over 5 MB without checking or uploading it", async () => {
      const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], "big.glb", { type: "model/gltf-binary" });
      await expect(createProductAction(EMPTY, form({ model: big }))).resolves.toEqual({ error: "The 3D model must be 5 MB or smaller." });
      expect(m.checkGarmentModel).not.toHaveBeenCalled();
      expect(m.uploadImage).not.toHaveBeenCalled();
    });

    it("create: deletes the uploaded model again when the product can't be saved", async () => {
      m.createProduct.mockRejectedValue(new ProductError("DB_ERROR", "Something went wrong with the products. Please try again."));
      const state = await createProductAction(EMPTY, form({ model: glbFile() }));
      expect(state.error).toBe("Something went wrong with the products. Please try again.");
      expect(m.deleteGarmentModel).toHaveBeenCalledWith(NEW_MODEL);
    });

    it("shows the model upload's friendly message (and has nothing to delete)", async () => {
      m.uploadModel.mockRejectedValue(new ImageUploadError("We couldn't upload the 3D model. Please try again."));
      await expect(createProductAction(EMPTY, form({ model: glbFile() }))).resolves.toEqual({
        error: "We couldn't upload the 3D model. Please try again.",
      });
      expect(m.deleteGarmentModel).not.toHaveBeenCalled();
    });

    it("edit: replaces the model (uploads and saves the new one, THEN deletes the old file)", async () => {
      m.getProduct.mockResolvedValue({ id: ID, category: "UPPER", modelUrl: OLD_MODEL });
      await expect(updateProductAction(ID, EMPTY, form({ image: null, model: glbFile() }))).rejects.toThrow("NEXT_REDIRECT");
      expect(m.updateProduct).toHaveBeenCalledWith(ID, expect.objectContaining({ modelUrl: NEW_MODEL }));
      expect(m.deleteGarmentModel).toHaveBeenCalledWith(OLD_MODEL);
      expect(m.deleteGarmentModel).not.toHaveBeenCalledWith(NEW_MODEL);
      expect(m.updateProduct.mock.invocationCallOrder[0]).toBeLessThan(m.deleteGarmentModel.mock.invocationCallOrder[0]);
    });

    it('edit: "Remove the 3D model" saves no model and deletes the old file, uploading nothing', async () => {
      m.getProduct.mockResolvedValue({ id: ID, category: "UPPER", modelUrl: OLD_MODEL });
      await expect(updateProductAction(ID, EMPTY, form({ image: null, removeModel: "on" }))).rejects.toThrow("NEXT_REDIRECT");
      expect(m.updateProduct).toHaveBeenCalledWith(ID, expect.objectContaining({ modelUrl: null }));
      expect(m.uploadModel).not.toHaveBeenCalled();
      expect(m.deleteGarmentModel).toHaveBeenCalledWith(OLD_MODEL);
    });

    it("edit: a newly chosen model wins over a ticked Remove", async () => {
      await expect(updateProductAction(ID, EMPTY, form({ model: glbFile(), removeModel: "on" }))).rejects.toThrow("NEXT_REDIRECT");
      expect(m.updateProduct).toHaveBeenCalledWith(ID, expect.objectContaining({ modelUrl: NEW_MODEL }));
    });

    it("edit: keeps the current model when it isn't changed", async () => {
      m.getProduct.mockResolvedValue({ id: ID, category: "UPPER", modelUrl: OLD_MODEL });
      await expect(updateProductAction(ID, EMPTY, form({ image: null }))).rejects.toThrow("NEXT_REDIRECT");
      expect(m.updateProduct).toHaveBeenCalledWith(ID, expect.not.objectContaining({ modelUrl: expect.anything() }));
      expect(m.deleteGarmentModel).not.toHaveBeenCalled();
    });

    it("edit: refuses a category change that would keep a model checked for the old category, before any upload", async () => {
      m.getProduct.mockResolvedValue({ id: ID, category: "UPPER", modelUrl: OLD_MODEL });
      const state = await updateProductAction(ID, EMPTY, form({ category: "LOWER" }));
      expect(state.error).toContain("checked for its old category");
      expect(m.uploadImage).not.toHaveBeenCalled();
      expect(m.updateProduct).not.toHaveBeenCalled();
    });

    it.each([
      ["with a new model", { model: glbFile() }],
      ["while removing the model", { removeModel: "on" }],
    ])("edit: allows that category change %s", async (_case, extra) => {
      m.getProduct.mockResolvedValue({ id: ID, category: "UPPER", modelUrl: OLD_MODEL });
      await expect(updateProductAction(ID, EMPTY, form({ image: null, category: "LOWER", ...extra }))).rejects.toThrow("NEXT_REDIRECT");
      expect(m.updateProduct).toHaveBeenCalledWith(ID, expect.objectContaining({ category: "LOWER" }));
    });

    it("edit: says the product doesn't exist (before any upload) when it was deleted meanwhile", async () => {
      m.getProduct.mockResolvedValue(null);
      await expect(updateProductAction(ID, EMPTY, form({ model: glbFile() }))).resolves.toEqual({ error: "That product doesn't exist." });
      expect(m.uploadImage).not.toHaveBeenCalled();
      expect(m.uploadModel).not.toHaveBeenCalled();
    });

    it("edit: shows a friendly message (before any upload) when the product can't be loaded", async () => {
      m.getProduct.mockRejectedValue(new ProductError("DB_ERROR", "Something went wrong with the products. Please try again."));
      await expect(updateProductAction(ID, EMPTY, form({ model: glbFile() }))).resolves.toEqual({
        error: "Something went wrong with the products. Please try again.",
      });
      expect(m.uploadImage).not.toHaveBeenCalled();
      expect(m.uploadModel).not.toHaveBeenCalled();
    });

    it("edit: if saving fails, deletes the NEW model and keeps the old one", async () => {
      m.getProduct.mockResolvedValue({ id: ID, category: "UPPER", modelUrl: OLD_MODEL });
      m.updateProduct.mockRejectedValue(new ProductError("NOT_FOUND", "That product doesn't exist."));
      await expect(updateProductAction(ID, EMPTY, form({ image: null, model: glbFile() }))).resolves.toEqual({
        error: "That product doesn't exist.",
      });
      expect(m.deleteGarmentModel).toHaveBeenCalledWith(NEW_MODEL);
      expect(m.deleteGarmentModel).not.toHaveBeenCalledWith(OLD_MODEL);
    });
  });

  describe("deleteProductAction", () => {
    it("checks admin access before deleting", async () => {
      m.requireAdmin.mockRejectedValue(new Error("NEXT_NOT_FOUND"));
      await expect(deleteProductAction(ID)).rejects.toThrow("NEXT_NOT_FOUND");
      expect(m.deleteProductAndImages).not.toHaveBeenCalled();
    });

    it("deletes the product with its images and refreshes the list", async () => {
      m.deleteProductAndImages.mockResolvedValue(undefined);
      await expect(deleteProductAction(ID)).resolves.toEqual({ error: null });
      expect(m.deleteProductAndImages).toHaveBeenCalledWith(ID);
      expect(m.revalidatePath).toHaveBeenCalledWith("/admin/products");
    });

    it("rejects a malformed id without touching the database", async () => {
      await expect(deleteProductAction("bad")).resolves.toEqual({ error: "That product doesn't exist." });
      expect(m.deleteProductAndImages).not.toHaveBeenCalled();
    });

    it("shows NOT_FOUND for an already-deleted product", async () => {
      m.deleteProductAndImages.mockRejectedValue(new ProductError("NOT_FOUND", "That product doesn't exist."));
      await expect(deleteProductAction(ID)).resolves.toEqual({ error: "That product doesn't exist." });
      expect(m.revalidatePath).not.toHaveBeenCalled(); // only IMAGES_NOT_DELETED refreshes on error
    });

    it("says to try again, and refreshes the list (the product is now hidden), when its try-on photos couldn't be deleted", async () => {
      const message =
        "We couldn't delete this product's try-on photos yet. It's hidden from shoppers now; please try deleting it again.";
      m.deleteProductAndImages.mockRejectedValue(new ProductError("IMAGES_NOT_DELETED", message));
      await expect(deleteProductAction(ID)).resolves.toEqual({ error: message });
      expect(m.revalidatePath).toHaveBeenCalledWith("/admin/products");
    });
  });

  describe("setProductActiveAction", () => {
    it("checks admin access before changing visibility", async () => {
      m.requireAdmin.mockRejectedValue(new Error("NEXT_NOT_FOUND"));
      await expect(setProductActiveAction(ID, false)).rejects.toThrow("NEXT_NOT_FOUND");
      expect(m.updateProduct).not.toHaveBeenCalled();
    });

    it.each([true, false])("sets isActive to %s and refreshes the list", async (isActive) => {
      await expect(setProductActiveAction(ID, isActive)).resolves.toEqual({ error: null });
      expect(m.updateProduct).toHaveBeenCalledWith(ID, { isActive });
      expect(m.revalidatePath).toHaveBeenCalledWith("/admin/products");
    });

    it("rejects a non-boolean value sent from the browser", async () => {
      const state = await setProductActiveAction(ID, "false" as unknown as boolean);
      expect(state.error).toContain("visible");
      expect(m.updateProduct).not.toHaveBeenCalled();
    });

    it("rejects a malformed id", async () => {
      await expect(setProductActiveAction("bad", true)).resolves.toEqual({ error: "That product doesn't exist." });
      expect(m.updateProduct).not.toHaveBeenCalled();
    });

    it.each([
      ["NOT_FOUND (deleted in another tab)", new ProductError("NOT_FOUND", "That product doesn't exist.")],
      ["DB_ERROR", new ProductError("DB_ERROR", "Something went wrong with the products. Please try again.")],
    ])("shows %s from the database", async (_label, dbError) => {
      m.updateProduct.mockRejectedValue(dbError);
      await expect(setProductActiveAction(ID, false)).resolves.toEqual({ error: dbError.message });
    });
  });
});
