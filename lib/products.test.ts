// @vitest-environment node
import { Prisma } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the database client: no MongoDB needed.
const { product } = vi.hoisted(() => ({
  product: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));
vi.mock("./prisma", () => ({ prisma: { product } }));

import {
  ProductError,
  createProduct,
  deleteProduct,
  getProduct,
  listActiveProducts,
  listAllProducts,
  updateProduct,
  validateProductInput,
  type ProductInput,
} from "./products";

const ID = "65f0c0ffee0000000000abcd";
const VALID: ProductInput = {
  name: "  Linen Shirt  ",
  imageUrl: "https://res.cloudinary.com/demo/image/upload/shirt.png",
  category: "UPPER",
  price: 29.99,
  description: "  Breathable summer shirt  ",
  buyLink: "https://shop.example.com/linen-shirt",
};

function notFoundError() {
  return new Prisma.PrismaClientKnownRequestError("Record not found", { code: "P2025", clientVersion: "6.19.3" });
}

async function productError(promise: Promise<unknown>): Promise<ProductError> {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ProductError);
  return error as ProductError;
}

describe("lib/products", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    Object.values(product).forEach((fn) => fn.mockReset());
  });

  describe("validateProductInput", () => {
    it("trims text and keeps valid fields", () => {
      expect(validateProductInput(VALID)).toEqual({
        ...VALID,
        name: "Linen Shirt",
        description: "Breathable summer shirt",
      });
    });

    it("turns empty optional text into null", () => {
      expect(validateProductInput({ ...VALID, description: "   ", buyLink: "" })).toMatchObject({
        description: null,
        buyLink: null,
      });
    });

    it.each([
      ["a missing name", { name: "  " }, "Please enter a product name."],
      ["a too-long name", { name: "x".repeat(121) }, "120 characters"],
      ["a non-https image", { imageUrl: "http://x.com/a.png" }, "Please add a product image."],
      ["an unknown category", { category: "SHOES" as ProductInput["category"] }, "Please choose a category."],
      ["an inherited key as category", { category: "toString" as ProductInput["category"] }, "Please choose a category."],
      ["a negative price", { price: -1 }, "zero or more"],
      ["a NaN price", { price: Number.NaN }, "zero or more"],
      ["a non-https buy link", { buyLink: "shop.example.com" }, "https://"],
      ["a too-long description", { description: "x".repeat(2001) }, "2000 characters"],
    ])("rejects %s", (_label, change, message) => {
      expect(() => validateProductInput({ ...VALID, ...change })).toThrow(message);
    });

    it("trims the image URL", () => {
      expect(validateProductInput({ ...VALID, imageUrl: `  ${VALID.imageUrl}  ` }).imageUrl).toBe(VALID.imageUrl);
    });

    it.each([
      ["a non-string name", { name: 42 }, "Please enter a product name."],
      ["a non-string image URL", { imageUrl: ["x"] }, "Please add a product image."],
      ["a string price", { price: "29.99" }, "zero or more"],
      ["a non-boolean isActive", { isActive: "false" }, "visible"],
    ])("rejects %s from untyped form data as INVALID_INPUT", (_label, change, message) => {
      const bad = { ...VALID, ...change } as unknown as ProductInput;
      try {
        validateProductInput(bad);
        expect.unreachable("should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(ProductError);
        expect((error as ProductError).code).toBe("INVALID_INPUT");
        expect((error as ProductError).message).toContain(message);
      }
    });

    it("with partial=true, only checks the given fields", () => {
      expect(validateProductInput({ isActive: false }, true)).toEqual({ isActive: false });
      expect(() => validateProductInput({ name: "" }, true)).toThrow("Please enter a product name.");
    });
  });

  it("listActiveProducts returns active products, newest first", async () => {
    product.findMany.mockResolvedValue([{ id: ID }]);
    await expect(listActiveProducts()).resolves.toEqual([{ id: ID }]);
    expect(product.findMany).toHaveBeenCalledWith({ where: { isActive: true }, orderBy: { createdAt: "desc" } });
  });

  it("listAllProducts includes hidden products", async () => {
    product.findMany.mockResolvedValue([]);
    await listAllProducts();
    expect(product.findMany).toHaveBeenCalledWith({ orderBy: { createdAt: "desc" } });
  });

  describe("getProduct", () => {
    it("finds a product by id", async () => {
      product.findUnique.mockResolvedValue({ id: ID });
      await expect(getProduct(ID)).resolves.toEqual({ id: ID });
      expect(product.findUnique).toHaveBeenCalledWith({ where: { id: ID } });
    });

    it("returns null for a malformed id without querying", async () => {
      await expect(getProduct("not-an-id")).resolves.toBeNull();
      expect(product.findUnique).not.toHaveBeenCalled();
    });

    it("is DB_ERROR (not null) when the database fails", async () => {
      product.findUnique.mockRejectedValue(new Error("timeout"));
      expect((await productError(getProduct(ID))).code).toBe("DB_ERROR");
    });
  });

  describe("createProduct", () => {
    it("saves the validated data", async () => {
      product.create.mockResolvedValue({ id: ID });
      await createProduct(VALID);
      expect(product.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ name: "Linen Shirt", category: "UPPER" }),
      });
    });

    it("rejects invalid input without touching the database", async () => {
      const error = await productError(createProduct({ ...VALID, name: "" }));
      expect(error.code).toBe("INVALID_INPUT");
      expect(product.create).not.toHaveBeenCalled();
    });
  });

  describe("updateProduct", () => {
    it("updates only the given fields", async () => {
      product.update.mockResolvedValue({ id: ID });
      await updateProduct(ID, { isActive: false });
      expect(product.update).toHaveBeenCalledWith({ where: { id: ID }, data: { isActive: false } });
    });

    it("is NOT_FOUND for an unknown id", async () => {
      product.update.mockRejectedValue(notFoundError());
      expect((await productError(updateProduct(ID, { isActive: true }))).code).toBe("NOT_FOUND");
    });

    it("is NOT_FOUND for a malformed id without querying", async () => {
      expect((await productError(updateProduct("bad", { isActive: true }))).code).toBe("NOT_FOUND");
      expect(product.update).not.toHaveBeenCalled();
    });
  });

  describe("deleteProduct", () => {
    it("deletes by id", async () => {
      product.delete.mockResolvedValue({ id: ID });
      await deleteProduct(ID);
      expect(product.delete).toHaveBeenCalledWith({ where: { id: ID } });
    });

    it("is NOT_FOUND for an unknown id", async () => {
      product.delete.mockRejectedValue(notFoundError());
      expect((await productError(deleteProduct(ID))).code).toBe("NOT_FOUND");
    });
  });

  it("hides database errors from users but logs them", async () => {
    const dbError = new Error("connection refused 10.0.0.5:27017");
    product.findMany.mockRejectedValue(dbError);
    const error = await productError(listActiveProducts());
    expect(error.code).toBe("DB_ERROR");
    expect(error.message).not.toContain("10.0.0.5");
    expect(error.cause).toBe(dbError);
    expect(console.error).toHaveBeenCalledWith("[products] listActiveProducts failed:", dbError);
  });
});
