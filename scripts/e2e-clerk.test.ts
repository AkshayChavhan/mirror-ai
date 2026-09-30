// @vitest-environment node
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { E2E_USERS, assertTestClerkKey, loadClerkKeys } from "./e2e-clerk";

// Fake keys only: these tests write throwaway env files to a temp folder and never contact Clerk.
// Short, obviously fake values, so no secret scanner mistakes them for real keys.
const PK = "pk_test_x";
const SK = "sk_test_x";

describe("loadClerkKeys", () => {
  let dir: string;
  const file = (name: string, content: string) => {
    const path = join(dir, name);
    writeFileSync(path, content);
    return path;
  };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "e2e-clerk-"));
    // Start from "not set", and let unstubAllEnvs put back whatever this process had.
    for (const key of ["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "CLERK_SECRET_KEY", "DATABASE_URL", "E2E_DATABASE_URL"]) {
      vi.stubEnv(key, undefined);
    }
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(dir, { recursive: true, force: true });
  });

  it("loads ONLY the two Clerk keys from an env file, never anything else (e.g. database URLs)", () => {
    const env = file(
      ".env",
      `DATABASE_URL="mongodb+srv://someone:pw@db.example.com/app"\nE2E_DATABASE_URL="<local-mongodb-test-url>"\nNEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="${PK}"\nCLERK_SECRET_KEY="${SK}"\n`,
    );
    expect(loadClerkKeys([env])).toBe(true);
    expect(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY).toBe(PK);
    expect(process.env.CLERK_SECRET_KEY).toBe(SK);
    expect(process.env.DATABASE_URL).toBeUndefined();
    expect(process.env.E2E_DATABASE_URL).toBeUndefined();
  });

  it("never overrides keys that are already set (CI's secrets win)", () => {
    vi.stubEnv("CLERK_SECRET_KEY", "sk_test_ci");
    const env = file(".env", `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=${PK}\nCLERK_SECRET_KEY=${SK}\n`);
    expect(loadClerkKeys([env])).toBe(true);
    expect(process.env.CLERK_SECRET_KEY).toBe("sk_test_ci");
  });

  it("uses the first file that has a key (.env.local before .env)", () => {
    const local = file(".env.local", "CLERK_SECRET_KEY=sk_test_local\n");
    const env = file(".env", `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=${PK}\nCLERK_SECRET_KEY=${SK}\n`);
    expect(loadClerkKeys([local, env])).toBe(true);
    expect(process.env.CLERK_SECRET_KEY).toBe("sk_test_local");
    expect(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY).toBe(PK);
  });

  it("returns false when a key is missing or the files don't exist", () => {
    expect(loadClerkKeys([join(dir, "missing.env")])).toBe(false);
    const env = file(".env", `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=${PK}\n`);
    expect(loadClerkKeys([env])).toBe(false);
  });
});

describe("assertTestClerkKey", () => {
  it("accepts a development key", () => {
    expect(() => assertTestClerkKey(SK)).not.toThrow();
  });

  it.each([
    ["a production key", "sk_live_notARealKey"],
    ["an empty key", ""],
  ])("refuses %s, without repeating it", (_case, key) => {
    expect(() => assertTestClerkKey(key)).toThrow("isn't a development (sk_test_) key");
    expect(() => assertTestClerkKey(key)).toThrow(expect.objectContaining({ message: expect.not.stringContaining("notARealKey") }));
  });
});

describe("E2E_USERS", () => {
  it("are Clerk test emails (+clerk_test@example.com: no real email is sent)", () => {
    for (const email of Object.values(E2E_USERS)) expect(email).toMatch(/^[a-z0-9-]+\+clerk_test@example\.com$/);
  });
});
