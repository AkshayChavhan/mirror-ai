// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A fake cookie store instead of a real request: next/headers' cookies() is mocked.
const store = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => store }));

import { ANONYMOUS_ID_COOKIE, getAnonymousId, getOrCreateAnonymousId } from "./anonymous-id";

const VALID = "3f2b8c1e-9d4a-4b7e-8a21-5c6d7e8f9a0b";
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function cookieHas(value: string | undefined) {
  store.get.mockImplementation((name: string) =>
    name === ANONYMOUS_ID_COOKIE && value !== undefined ? { name, value } : undefined,
  );
}

describe("lib/anonymous-id", () => {
  beforeEach(() => cookieHas(undefined));
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  describe("getAnonymousId", () => {
    it("returns the id from the cookie", async () => {
      cookieHas(VALID);
      await expect(getAnonymousId()).resolves.toBe(VALID);
      expect(store.get).toHaveBeenCalledWith("mirror_anon_id");
    });

    it("returns null when there is no cookie", async () => {
      await expect(getAnonymousId()).resolves.toBeNull();
    });

    it.each([
      ["an empty value", ""],
      ["a made-up value", "admin"],
      ["another user id format", "user_2abc"],
      ["a UUID that isn't version 4", "3f2b8c1e-9d4a-1b7e-8a21-5c6d7e8f9a0b"],
      ["a UUID with extra text", `${VALID}; drop`],
      ["an uppercase copy (randomUUID only makes lowercase)", VALID.toUpperCase()],
    ])("ignores %s (the cookie comes from the browser)", async (_case, value) => {
      cookieHas(value);
      await expect(getAnonymousId()).resolves.toBeNull();
    });
  });

  describe("getOrCreateAnonymousId", () => {
    it("reuses a valid existing id without setting a cookie", async () => {
      cookieHas(VALID);
      await expect(getOrCreateAnonymousId()).resolves.toBe(VALID);
      expect(store.set).not.toHaveBeenCalled();
    });

    it("creates a random UUID v4 and stores it in a locked-down cookie for a year", async () => {
      const id = await getOrCreateAnonymousId();
      expect(id).toMatch(UUID_V4);
      expect(store.set).toHaveBeenCalledWith("mirror_anon_id", id, {
        httpOnly: true,
        sameSite: "lax",
        secure: false, // tests don't run in production
        path: "/",
        maxAge: 31_536_000,
      });
    });

    it("replaces a tampered cookie with a new id", async () => {
      cookieHas("admin");
      const id = await getOrCreateAnonymousId();
      expect(id).toMatch(UUID_V4);
      expect(store.set).toHaveBeenCalledWith("mirror_anon_id", id, expect.any(Object));
    });

    it("makes the cookie HTTPS-only in production", async () => {
      vi.stubEnv("NODE_ENV", "production");
      await getOrCreateAnonymousId();
      expect(store.set).toHaveBeenCalledWith("mirror_anon_id", expect.any(String), expect.objectContaining({ secure: true }));
    });

    it("gives every new visitor a different id", async () => {
      const a = await getOrCreateAnonymousId();
      const b = await getOrCreateAnonymousId();
      expect(a).not.toBe(b);
    });
  });
});
