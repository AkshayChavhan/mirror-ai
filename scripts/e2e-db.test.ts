// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A fake PrismaClient: these tests never connect to any database.
const client = vi.hoisted(() => ({
  wishlistItem: { deleteMany: vi.fn(), createMany: vi.fn() },
  tryOn: { deleteMany: vi.fn(), createMany: vi.fn() },
  product: { deleteMany: vi.fn(), createMany: vi.fn() },
  $disconnect: vi.fn(),
}));
const PrismaClient = vi.hoisted(() =>
  vi.fn(function FakePrismaClient() {
    return client;
  }),
);
vi.mock("@prisma/client", () => ({ PrismaClient }));

import { E2E_DATA, assertSafeTestDatabase, seedTestDatabase } from "./e2e-db";

const SAFE = "mongodb://localhost:27017/mirror-ai-e2e?replicaSet=rs0&directConnection=true";

describe("assertSafeTestDatabase", () => {
  it.each([
    ["the CI test database", SAFE],
    ["127.0.0.1 with an _e2e name", "mongodb://127.0.0.1:27017/app_e2e"],
  ])("accepts %s", (_case, url) => {
    expect(() => assertSafeTestDatabase(url)).not.toThrow();
  });

  it.each([
    ["an Atlas-style (+srv) database", "mongodb+srv://someone:s3cret-pass@db.example.com/mirror-ai"],
    ["an Atlas-style (+srv) database named -e2e", "mongodb+srv://someone:s3cret-pass@db.example.com/mirror-ai-e2e"],
    ["a remote host, even named -e2e", "mongodb://db.example.com:27017/mirror-ai-e2e"],
    ["a local database without an e2e name", "mongodb://localhost:27017/mirror-ai"],
    ["e2e in the middle of the name", "mongodb://localhost:27017/e2e-prod"],
    ["not a URL", "definitely not a url"],
  ])("refuses %s", (_case, url) => {
    expect(() => assertSafeTestDatabase(url)).toThrow(/Refusing to seed|not a valid URL/);
  });

  it("never repeats the URL (it could contain a password) in its error", () => {
    const url = "mongodb+srv://someone:s3cret-pass@db.example.com/mirror-ai";
    expect(() => assertSafeTestDatabase(url)).toThrow(expect.objectContaining({ message: expect.not.stringContaining("s3cret") }));
  });
});

describe("seedTestDatabase", () => {
  beforeEach(() => {
    for (const model of [client.wishlistItem, client.tryOn, client.product]) {
      model.deleteMany.mockResolvedValue({ count: 0 });
      model.createMany.mockResolvedValue({ count: 3 });
    }
    client.$disconnect.mockResolvedValue(undefined);
  });
  afterEach(() => vi.clearAllMocks());

  it("refuses an unsafe URL before even creating a database client", async () => {
    await expect(seedTestDatabase("mongodb+srv://u:p@db.example.com/mirror-ai")).rejects.toThrow("Refusing to seed");
    expect(PrismaClient).not.toHaveBeenCalled();
  });

  it("empties the test database (children first), then adds the sample data, then disconnects", async () => {
    await seedTestDatabase(SAFE);

    expect(PrismaClient).toHaveBeenCalledWith({ datasourceUrl: SAFE });
    const order = [
      client.wishlistItem.deleteMany,
      client.tryOn.deleteMany,
      client.product.deleteMany,
      client.product.createMany,
      client.tryOn.createMany,
      client.wishlistItem.createMany,
      client.$disconnect,
    ].map((fn) => fn.mock.invocationCallOrder[0]);
    expect(order).toEqual([...order].sort((a, b) => a - b));

    const products = client.product.createMany.mock.calls[0][0].data;
    expect(products.map((p: { name: string; isActive: boolean }) => [p.name, p.isActive])).toEqual([
      ["E2E Linen Shirt", true],
      ["E2E Summer Dress", true],
      ["E2E Hidden Jacket", false],
    ]);
    const tryOns = client.tryOn.createMany.mock.calls[0][0].data;
    expect(tryOns.map((t: { shareId: string; status: string }) => [t.shareId, t.status])).toEqual([
      [E2E_DATA.shareIds.done, "DONE"],
      [E2E_DATA.shareIds.failed, "FAILED"],
    ]);
    const wishlist = client.wishlistItem.createMany.mock.calls[0][0].data;
    expect(wishlist).toHaveLength(3);
    expect(wishlist.every((w: { anonymousId: string }) => w.anonymousId === E2E_DATA.anonymousId)).toBe(true);
  });

  it("still disconnects when seeding fails", async () => {
    client.product.createMany.mockRejectedValue(new Error("duplicate key"));
    await expect(seedTestDatabase(SAFE)).rejects.toThrow("duplicate key");
    expect(client.$disconnect).toHaveBeenCalled();
  });
});

describe("E2E_DATA (must pass the app's own format checks)", () => {
  it("uses share tokens shaped like real ones (lib/tryons.ts)", () => {
    for (const id of Object.values(E2E_DATA.shareIds)) expect(id).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  it("uses a lowercase UUID v4 anonymous id (lib/anonymous-id.ts)", () => {
    expect(E2E_DATA.anonymousId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("uses ObjectId-shaped product ids and an https Cloudinary image", () => {
    for (const { id } of Object.values(E2E_DATA.products)) expect(id).toMatch(/^[a-f0-9]{24}$/);
    expect(E2E_DATA.imageUrl).toMatch(/^https:\/\/res\.cloudinary\.com\//);
  });
});
