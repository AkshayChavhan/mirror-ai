// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Clerk and the database are mocked: no real session, no MongoDB.
const m = vi.hoisted(() => ({ auth: vi.fn(), getTryOnStatus: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth: m.auth }));
vi.mock("@/lib/tryons", async () => {
  const actual = await vi.importActual<typeof import("@/lib/tryons")>("@/lib/tryons");
  return { TryOnRecordError: actual.TryOnRecordError, getTryOnStatus: m.getTryOnStatus };
});

import { TryOnRecordError } from "@/lib/tryons";
import { GET } from "./route";

const ID = "65f0c0ffee0000000000abcd";
const DONE = {
  status: "DONE",
  resultUrl: "https://res.cloudinary.com/demo/r.png",
  errorMessage: null,
  shareId: "Zm9vYmFyYmF6cXV4MTIzNA", // the owner gets the share token for the result link (task 56)
};

function call(id = ID) {
  return GET(new NextRequest(`http://localhost:3000/api/tryon/${id}/status`), { params: Promise.resolve({ id }) });
}

describe("GET /api/tryon/[id]/status", () => {
  beforeEach(() => {
    m.auth.mockResolvedValue({ userId: "user_123" });
    m.getTryOnStatus.mockResolvedValue(DONE);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("returns the owner's try-on status, never cached", async () => {
    const response = await call();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(DONE);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(m.getTryOnStatus).toHaveBeenCalledWith(ID, "user_123"); // the id from the URL, the user from the session
  });

  it("returns 401 when signed out, without looking anything up", async () => {
    m.auth.mockResolvedValue({ userId: null });
    const response = await call();
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Please sign in." });
    expect(m.getTryOnStatus).not.toHaveBeenCalled();
  });

  it("returns the same 404 for a missing try-on and someone else's, so ids can't be probed", async () => {
    m.getTryOnStatus.mockResolvedValue(null);
    const response = await call();
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "That try-on doesn't exist." });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("returns 500 with a friendly message on a database error (already logged by lib/tryons)", async () => {
    m.getTryOnStatus.mockRejectedValue(new TryOnRecordError("DB_ERROR", "Something went wrong saving your try-on."));
    const response = await call();
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "We couldn't check your try-on. Please try again." });
    expect(console.error).not.toHaveBeenCalled();
  });

  it("hides unexpected errors behind a generic message and logs them", async () => {
    const bug = new TypeError("Cannot read properties of undefined");
    m.getTryOnStatus.mockRejectedValue(bug);
    const response = await call();
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "We couldn't check your try-on. Please try again." });
    expect(console.error).toHaveBeenCalledWith("[api/tryon/status] Unexpected error:", bug);
  });

  it("still answers with JSON (not an HTML error page) if Clerk itself fails", async () => {
    const clerkError = new Error("clerkMiddleware() was not run");
    m.auth.mockRejectedValue(clerkError);
    const response = await call();
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "We couldn't check your try-on. Please try again." });
    expect(m.getTryOnStatus).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith("[api/tryon/status] Unexpected error:", clerkError);
  });
});
