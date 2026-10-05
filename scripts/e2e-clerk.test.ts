// @vitest-environment node
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { E2E_USERS, assertTestClerkKey, loadClerkKeys, redactClerkTokens, redactClerkTokensInConsole } from "./e2e-clerk";

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

// Task 71: fake tokens only ("dvb_FAKE…"), shaped like the development-browser tokens in Frontend API URLs.
const LEAKY_URL = "https://example-instance.clerk.accounts.dev/v1/client?__clerk_api_version=2026-05-12&__clerk_db_jwt=dvb_FAKE123abc";

describe("redactClerkTokens", () => {
  it("replaces the token in a Frontend API URL, keeping the rest", () => {
    expect(redactClerkTokens(LEAKY_URL)).toBe(
      "https://example-instance.clerk.accounts.dev/v1/client?__clerk_api_version=2026-05-12&__clerk_db_jwt=<redacted>",
    );
  });

  it("stops at the next parameter, and handles several tokens in one message", () => {
    const text = `a?__clerk_db_jwt=dvb_ONE&x=1 then b?__clerk_db_jwt=dvb_TWO`;
    expect(redactClerkTokens(text)).toBe("a?__clerk_db_jwt=<redacted>&x=1 then b?__clerk_db_jwt=<redacted>");
  });

  it("redacts @clerk/testing's whole warning, including a token inside the error's text", () => {
    const warning = `[Clerk Testing] FAPI request failed after 4 attempts: ${LEAKY_URL} (Error: route.fetch: Test ended.)`;
    const out = redactClerkTokens(warning);
    expect(out).not.toContain("dvb_FAKE123abc");
    expect(out).toContain("__clerk_db_jwt=<redacted> (Error: route.fetch: Test ended.)");
  });

  it("also redacts the testing token, and stops at a cookie separator", () => {
    expect(redactClerkTokens("GET /v1/client?__clerk_testing_token=FAKE_TESTING_TOKEN&x=1")).toBe(
      "GET /v1/client?__clerk_testing_token=<redacted>&x=1",
    );
    expect(redactClerkTokens("cookie: a=1; __clerk_db_jwt=dvb_FAKE; b=2")).toBe("cookie: a=1; __clerk_db_jwt=<redacted>; b=2");
  });

  it("leaves text without a token alone", () => {
    expect(redactClerkTokens("[Clerk Testing] all good")).toBe("[Clerk Testing] all good");
  });
});

describe("redactClerkTokensInConsole", () => {
  const fakeConsole = () => ({ log: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() });

  it("redacts tokens in what every console level prints, and passes everything else through", () => {
    const printed = fakeConsole();
    const target = { ...printed };
    redactClerkTokensInConsole(target);
    target.warn("[Clerk Testing] FAPI request failed:", LEAKY_URL, 42);
    expect(printed.warn).toHaveBeenCalledWith(
      "[Clerk Testing] FAPI request failed:",
      expect.stringContaining("__clerk_db_jwt=<redacted>"),
      42,
    );
    for (const level of ["log", "info", "error", "debug"] as const) {
      target[level](LEAKY_URL);
      expect(printed[level].mock.calls[0][0]).not.toContain("dvb_FAKE123abc");
    }
  });

  it("redacts an Error's message and stack (e.g. one passed to console.error)", () => {
    const printed = fakeConsole();
    const target = { ...printed };
    redactClerkTokensInConsole(target);
    target.error(new Error(`route.continue failed for ${LEAKY_URL}`));
    const error = printed.error.mock.calls[0][0] as Error;
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe(`route.continue failed for ${redactClerkTokens(LEAKY_URL)}`);
    expect(error.stack).not.toContain("dvb_FAKE123abc");
  });

  it("does nothing the second time for the same console (no double wrapping)", () => {
    const printed = fakeConsole();
    const target = { ...printed };
    redactClerkTokensInConsole(target);
    const wrapped = target.warn;
    redactClerkTokensInConsole(target);
    expect(target.warn).toBe(wrapped);
  });
});

describe("signed-in E2E specs (task 71)", () => {
  // A spec that signs in through @clerk/testing can print tokens, so each one must turn on the redaction.
  const specs = readdirSync("e2e").filter((name) => name.endsWith(".spec.ts"));
  const signedIn = specs.filter((name) => readFileSync(join("e2e", name), "utf8").includes("@clerk/testing/playwright"));

  it("finds the signed-in specs", () => {
    expect(signedIn.length).toBeGreaterThanOrEqual(5);
  });

  it.each(signedIn)("%s turns on token redaction", (name) => {
    expect(readFileSync(join("e2e", name), "utf8")).toMatch(/^redactClerkTokensInConsole\(\);$/m);
  });
});
