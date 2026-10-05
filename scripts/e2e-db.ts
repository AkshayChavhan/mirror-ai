import { PrismaClient } from "@prisma/client";

// The E2E test database (task 60): a throwaway local MongoDB that Playwright fills with known sample data,
// so E2E tests can open pages that need real rows (a finished try-on, saved wishlist items, products).
// CI starts one in Docker. It is NEVER the developer's Atlas database: seedTestDatabase() refuses any URL
// that isn't on this machine AND named "...-e2e", because seeding deletes everything first.

/** Sample data the E2E specs can rely on. Ids are fixed so specs can refer to them. */
export const E2E_DATA = {
  products: {
    shirt: { id: "650000000000000000000001", name: "E2E Linen Shirt" },
    dress: { id: "650000000000000000000002", name: "E2E Summer Dress" },
    hidden: { id: "650000000000000000000003", name: "E2E Hidden Jacket" },
    /** Has an uploaded 3D model (task 72). Older than the others, so pages that open the newest garment don't pick it. */
    model3d: { id: "650000000000000000000004", name: "E2E 3D Shirt" },
  },
  /** Share tokens: 22 base64url characters, like real ones (lib/tryons.ts). */
  shareIds: { done: "e2eDoneShareToken00000", failed: "e2eFailedShareToken000" },
  /** The anonymous visitor whose wishlist is seeded (a lowercase UUID v4, like lib/anonymous-id.ts makes). */
  anonymousId: "0b8e4f9a-3c2d-4e5f-8a6b-7c8d9e0f1a2b",
  /** Cloudinary's public demo image, so image URLs are real https Cloudinary URLs. */
  imageUrl: "https://res.cloudinary.com/demo/image/upload/sample.jpg",
  /** A raw file URL in the demo account. Nothing is there: the Live 3D spec serves a generated model for it. */
  modelUrl: "https://res.cloudinary.com/demo/raw/upload/v1/mirror-ai/models/e2e-3d-shirt",
} as const;

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Throws unless `url` is a MongoDB on this machine whose database name ends in "-e2e" or "_e2e".
 * This is the only thing standing between "seed the test data" and "wipe a real database".
 */
export function assertSafeTestDatabase(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("E2E_DATABASE_URL is not a valid URL.");
  }
  const database = parsed.pathname.replace(/^\//, "");
  const local = parsed.protocol === "mongodb:" && LOCAL_HOSTS.has(parsed.hostname);
  if (!local || !/[-_]e2e$/.test(database)) {
    // Never print the URL itself: a mistaken real URL would contain a password.
    throw new Error(
      'Refusing to seed: E2E_DATABASE_URL must be a local mongodb:// URL whose database name ends in "-e2e".',
    );
  }
}

/** Replaces everything in the test database with E2E_DATA. Only runs after assertSafeTestDatabase passes. */
export async function seedTestDatabase(url: string): Promise<void> {
  assertSafeTestDatabase(url);
  const prisma = new PrismaClient({ datasourceUrl: url });
  const { products, shareIds, anonymousId, imageUrl, modelUrl } = E2E_DATA;
  try {
    // Children first, then products.
    await prisma.wishlistItem.deleteMany({});
    await prisma.tryOn.deleteMany({});
    await prisma.product.deleteMany({});

    await prisma.product.createMany({
      data: [
        { id: products.shirt.id, name: products.shirt.name, imageUrl, category: "UPPER", price: 29.99, isActive: true },
        { id: products.dress.id, name: products.dress.name, imageUrl, category: "OVERALL", price: 49, isActive: true },
        { id: products.hidden.id, name: products.hidden.name, imageUrl, category: "UPPER", isActive: false },
        {
          id: products.model3d.id,
          name: products.model3d.name,
          imageUrl,
          modelUrl,
          category: "UPPER",
          isActive: true,
          createdAt: new Date("2020-01-01T00:00:00Z"),
        },
      ],
    });
    await prisma.tryOn.createMany({
      data: [
        {
          shareId: shareIds.done,
          userId: "user_e2e_seed",
          productId: products.shirt.id,
          personUrl: imageUrl,
          resultUrl: imageUrl,
          status: "DONE",
        },
        {
          shareId: shareIds.failed,
          userId: "user_e2e_seed",
          productId: products.dress.id,
          personUrl: imageUrl,
          status: "FAILED",
          errorMessage: "Try-on is busy right now. Please try again later.",
        },
      ],
    });
    await prisma.wishlistItem.createMany({
      data: [
        { anonymousId, productId: products.shirt.id },
        { anonymousId, productId: products.dress.id },
        { anonymousId, productId: products.hidden.id }, // hidden garments must not show on /wishlist
      ],
    });
  } finally {
    await prisma.$disconnect();
  }
}
