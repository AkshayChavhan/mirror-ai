// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock Clerk and Next's navigation helpers: no real sessions, no network.
const { auth, currentUser, redirectToSignIn, notFound } = vi.hoisted(() => ({
  auth: vi.fn(),
  currentUser: vi.fn(),
  redirectToSignIn: vi.fn(() => {
    throw new Error("NEXT_REDIRECT:/sign-in");
  }),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
vi.mock("@clerk/nextjs/server", () => ({ auth, currentUser }));
vi.mock("next/navigation", () => ({ notFound }));

import { isAdmin, requireAdmin, requireUser } from "./auth";

function signedIn(userId: string) {
  auth.mockResolvedValue({ userId, redirectToSignIn });
}
function signedOut() {
  auth.mockResolvedValue({ userId: null, redirectToSignIn });
}

describe("lib/auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("requireUser", () => {
    it("returns the Clerk user id when signed in", async () => {
      signedIn("user_123");
      await expect(requireUser()).resolves.toBe("user_123");
      expect(redirectToSignIn).not.toHaveBeenCalled();
    });

    it("redirects to sign-in when signed out", async () => {
      signedOut();
      await expect(requireUser()).rejects.toThrow("NEXT_REDIRECT:/sign-in");
      expect(redirectToSignIn).toHaveBeenCalledTimes(1);
    });
  });

  describe("isAdmin", () => {
    it.each([
      [{ publicMetadata: { role: "admin" } }, true],
      [{ publicMetadata: { role: "user" } }, false],
      [{ publicMetadata: {} }, false],
      [null, false],
    ])("user %j → %s", async (user, expected) => {
      currentUser.mockResolvedValue(user);
      await expect(isAdmin()).resolves.toBe(expected);
    });
  });

  describe("requireAdmin", () => {
    it("returns the user id for an admin", async () => {
      signedIn("user_admin");
      currentUser.mockResolvedValue({ publicMetadata: { role: "admin" } });
      await expect(requireAdmin()).resolves.toBe("user_admin");
    });

    it("gives a 404 to a signed-in non-admin (hides the admin area)", async () => {
      signedIn("user_123");
      currentUser.mockResolvedValue({ publicMetadata: {} });
      await expect(requireAdmin()).rejects.toThrow("NEXT_NOT_FOUND");
    });

    it("redirects signed-out visitors to sign-in before checking the role", async () => {
      signedOut();
      await expect(requireAdmin()).rejects.toThrow("NEXT_REDIRECT:/sign-in");
      expect(currentUser).not.toHaveBeenCalled();
    });
  });
});
