import { Category, Prisma, type Product } from "@prisma/client";
import { prisma } from "./prisma";

// Server-only product data access (docs/project-plan.md, "Product"). Admin checks happen in the
// calling page/action (requireAdmin()); this module only validates input and talks to the database.

export type ProductErrorCode = "INVALID_INPUT" | "NOT_FOUND" | "DB_ERROR";

/** Any product problem. `message` is safe to show users; details are logged on the server. */
export class ProductError extends Error {
  constructor(
    public readonly code: ProductErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "ProductError";
  }
}

export type ProductInput = {
  name: string;
  imageUrl: string;
  category: Category;
  price?: number | null;
  description?: string | null;
  buyLink?: string | null;
  isActive?: boolean;
};

const OBJECT_ID = /^[a-f0-9]{24}$/i;

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function invalid(message: string): never {
  throw new ProductError("INVALID_INPUT", message);
}

/** A trimmed string, "" for null/undefined; anything else (e.g. raw form data) is INVALID_INPUT. */
function text(value: unknown, message: string): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") invalid(message);
  return value.trim();
}

/**
 * Checks and normalises product fields. With `partial`, only the given fields are checked.
 * Types are checked at runtime too, because Server Actions may pass untyped form data.
 */
export function validateProductInput(input: Partial<ProductInput>, partial = false): Partial<ProductInput> {
  const out: Partial<ProductInput> = {};

  if (!partial || input.name !== undefined) {
    const name = text(input.name, "Please enter a product name.");
    if (!name) invalid("Please enter a product name.");
    if (name.length > 120) invalid("The product name must be 120 characters or fewer.");
    out.name = name;
  }
  if (!partial || input.imageUrl !== undefined) {
    const imageUrl = text(input.imageUrl, "Please add a product image.");
    if (!imageUrl || !isHttpsUrl(imageUrl)) invalid("Please add a product image.");
    out.imageUrl = imageUrl;
  }
  if (!partial || input.category !== undefined) {
    const category: unknown = input.category;
    if (typeof category !== "string" || !Object.hasOwn(Category, category)) invalid("Please choose a category.");
    out.category = category as Category;
  }
  if (input.price !== undefined) {
    const price: unknown = input.price;
    if (price !== null && (typeof price !== "number" || !Number.isFinite(price) || price < 0)) {
      invalid("The price must be zero or more.");
    }
    out.price = price as number | null;
  }
  if (input.description !== undefined) {
    const description = text(input.description, "Please enter a valid description.") || null;
    if (description && description.length > 2000) invalid("The description must be 2000 characters or fewer.");
    out.description = description;
  }
  if (input.buyLink !== undefined) {
    const buyLink = text(input.buyLink, "The buy link must be a full https:// address.") || null;
    if (buyLink && !isHttpsUrl(buyLink)) invalid("The buy link must be a full https:// address.");
    out.buyLink = buyLink;
  }
  if (input.isActive !== undefined) {
    if (typeof input.isActive !== "boolean") invalid("Please choose whether the product is visible.");
    out.isActive = input.isActive;
  }
  return out;
}

function assertId(id: string): void {
  if (!OBJECT_ID.test(id)) throw new ProductError("NOT_FOUND", "That product doesn't exist.");
}

/** Runs a database call, turning Prisma errors into friendly ProductErrors. */
async function db<T>(action: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      throw new ProductError("NOT_FOUND", "That product doesn't exist.", { cause: error });
    }
    console.error(`[products] ${action} failed:`, error);
    throw new ProductError("DB_ERROR", "Something went wrong with the products. Please try again.", {
      cause: error,
    });
  }
}

/** Products shown to shoppers: active only, newest first. */
export function listActiveProducts(): Promise<Product[]> {
  return db("listActiveProducts", () =>
    prisma.product.findMany({ where: { isActive: true }, orderBy: { createdAt: "desc" } }),
  );
}

/** All products for the admin panel, newest first. */
export function listAllProducts(): Promise<Product[]> {
  return db("listAllProducts", () => prisma.product.findMany({ orderBy: { createdAt: "desc" } }));
}

/** One product, or null if the id is malformed or unknown. */
export async function getProduct(id: string): Promise<Product | null> {
  if (!OBJECT_ID.test(id)) return null;
  return db("getProduct", () => prisma.product.findUnique({ where: { id } }));
}

// async so validation errors reject the promise (never throw synchronously) like DB errors do.
export async function createProduct(input: ProductInput): Promise<Product> {
  const data = validateProductInput(input) as ProductInput;
  return db("createProduct", () => prisma.product.create({ data }));
}

export async function updateProduct(id: string, input: Partial<ProductInput>): Promise<Product> {
  assertId(id);
  const data = validateProductInput(input, true);
  return db("updateProduct", () => prisma.product.update({ where: { id }, data }));
}

export async function deleteProduct(id: string): Promise<void> {
  assertId(id);
  await db("deleteProduct", () => prisma.product.delete({ where: { id } }));
}
