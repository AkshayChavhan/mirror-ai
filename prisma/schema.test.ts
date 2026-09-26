import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Category, Prisma, TryOnStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";

// Paths are resolved from this file, so the test works from any working directory.
const ROOT = resolve(import.meta.dirname, "..");
const SCHEMA_PATH = resolve(ROOT, "prisma/schema.prisma");
const PRISMA_BIN = resolve(ROOT, "node_modules/.bin/prisma");
const schema = readFileSync(SCHEMA_PATH, "utf8");

describe("prisma/schema.prisma", () => {
  it("uses MongoDB with the URL from DATABASE_URL", () => {
    expect(schema).toMatch(/provider\s*=\s*"mongodb"/);
    expect(schema).toMatch(/url\s*=\s*env\("DATABASE_URL"\)/);
  });

  it("uses the classic Prisma 6 client generator", () => {
    expect(schema).toMatch(/provider\s*=\s*"prisma-client-js"/);
  });

  it("passes `prisma validate`", () => {
    // validate only needs DATABASE_URL to exist; it never connects, so a placeholder is enough.
    const output = execFileSync(PRISMA_BIN, ["validate", "--schema", SCHEMA_PATH], {
      env: { ...process.env, DATABASE_URL: "mongodb+srv://placeholder@example.invalid/mirror" },
      encoding: "utf8",
    });
    expect(output).toContain("is valid");
  }, 30_000);
});

// These read the generated client (`prisma generate`, which @prisma/client also runs on install),
// so they check that the models in docs/project-plan.md really exist with the planned fields.
describe("generated Prisma client", () => {
  it("has the Category and TryOnStatus enums", () => {
    expect(Object.values(Category)).toEqual(["UPPER", "LOWER", "OVERALL"]);
    expect(Object.values(TryOnStatus)).toEqual(["PENDING", "PROCESSING", "DONE", "FAILED"]);
  });

  it("has the planned Product fields", () => {
    expect(Object.keys(Prisma.ProductScalarFieldEnum)).toEqual([
      "id", "name", "imageUrl", "category", "price", "description", "buyLink", "isActive", "createdAt", "updatedAt",
    ]);
  });

  it("has the planned TryOn fields", () => {
    expect(Object.keys(Prisma.TryOnScalarFieldEnum)).toEqual([
      "id", "userId", "productId", "personUrl", "resultUrl", "status", "errorMessage", "createdAt",
    ]);
  });

  it("has WishlistItem with both userId and anonymousId (signed in or out)", () => {
    expect(Object.keys(Prisma.WishlistItemScalarFieldEnum)).toEqual([
      "id", "userId", "anonymousId", "productId", "createdAt",
    ]);
  });

  it("cascades product deletes to try-ons and wishlist items", () => {
    const relations = schema.match(/onDelete:\s*Cascade/g) ?? [];
    expect(relations).toHaveLength(2);
  });
});
