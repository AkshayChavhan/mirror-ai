import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the client: unit tests never connect to MongoDB.
const { PrismaClient } = vi.hoisted(() => ({ PrismaClient: vi.fn(function PrismaClient() {}) }));
vi.mock("@prisma/client", () => ({ PrismaClient }));

const globalForPrisma = globalThis as typeof globalThis & { prisma?: unknown };

async function importFresh() {
  vi.resetModules(); // simulate a Next.js hot reload / new module evaluation
  return (await import("./prisma")).prisma;
}

describe("lib/prisma", () => {
  beforeEach(() => {
    delete globalForPrisma.prisma;
    PrismaClient.mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    delete globalForPrisma.prisma;
  });

  it("creates a PrismaClient", async () => {
    const prisma = await importFresh();
    expect(prisma).toBeInstanceOf(PrismaClient);
    expect(PrismaClient).toHaveBeenCalledTimes(1);
  });

  it("reuses the same client across reloads in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const first = await importFresh();
    const second = await importFresh();
    expect(second).toBe(first);
    expect(PrismaClient).toHaveBeenCalledTimes(1);
    expect(globalForPrisma.prisma).toBe(first);
  });

  it("does not cache on globalThis in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await importFresh();
    expect(globalForPrisma.prisma).toBeUndefined();
  });
});
