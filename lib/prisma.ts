import { PrismaClient } from "@prisma/client";

// Server-only: uses DATABASE_URL. Never import this from a "use client" file.
//
// One PrismaClient per process. In development, Next.js hot reload re-runs modules, so without
// this cache every save would open a new client and its own connection pool. The client is
// kept on globalThis, which survives reloads. In production, the module runs once anyway.
const globalForPrisma = globalThis as typeof globalThis & { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
