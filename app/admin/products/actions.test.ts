// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Everything outside the action is mocked: auth, Cloudinary, the database, and Next's redirect/cache.
const m = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  uploadImage: vi.fn(),
  createProduct: vi.fn(),
  updateProduct: vi.fn(),
  deleteProduct: vi.fn(),
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
  return { ImageUploadError: actual.ImageUploadError, uploadImage: m.uploadImage };
});
vi.mock("@/lib/products", async () => {
  const actual = await vi.importActual<typeof import("@/lib/products")>("@/lib/products");
  return {
    ProductError: actual.ProductError,
    validateProductInput: actual.validateProductInput, // real validation, so field checks are tested
    createProduct: m.createProduct,
    updateProduct: m.updateProduct,
    deleteProduct: m.deleteProduct,
  };
});

import { ImageUploadError } from "@/lib/cloudinary";
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
    m.uploadImage.mockResolvedValue({ url: UPLOADED, publicId: "x", width: 1, height: 1 });
    m.createProduct.mockResolvedValue({ id: ID });
    m.updateProduct.mockResolvedValue({ id: ID });
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

  describe("deleteProductAction", () => {
    it("checks admin access before deleting", async () => {
      m.requireAdmin.mockRejectedValue(new Error("NEXT_NOT_FOUND"));
      await expect(deleteProductAction(ID)).rejects.toThrow("NEXT_NOT_FOUND");
      expect(m.deleteProduct).not.toHaveBeenCalled();
    });

    it("deletes and refreshes the list", async () => {
      m.deleteProduct.mockResolvedValue(undefined);
      await expect(deleteProductAction(ID)).resolves.toEqual({ error: null });
      expect(m.deleteProduct).toHaveBeenCalledWith(ID);
      expect(m.revalidatePath).toHaveBeenCalledWith("/admin/products");
    });

    it("rejects a malformed id without touching the database", async () => {
      await expect(deleteProductAction("bad")).resolves.toEqual({ error: "That product doesn't exist." });
      expect(m.deleteProduct).not.toHaveBeenCalled();
    });

    it("shows NOT_FOUND for an already-deleted product", async () => {
      m.deleteProduct.mockRejectedValue(new ProductError("NOT_FOUND", "That product doesn't exist."));
      await expect(deleteProductAction(ID)).resolves.toEqual({ error: "That product doesn't exist." });
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
