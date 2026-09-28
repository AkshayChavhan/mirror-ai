// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

// Inngest reads its mode (dev vs cloud) from the environment, so re-import the route for each case.
async function loadRoute() {
  vi.resetModules();
  return import("./route");
}

function get() {
  return new NextRequest("http://localhost:3000/api/inngest");
}

describe("app/api/inngest route", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks(); // also runs if an assertion fails
  });

  it("exports the GET, POST and PUT handlers Inngest calls", async () => {
    const route = await loadRoute();
    expect(typeof route.GET).toBe("function");
    expect(typeof route.POST).toBe("function");
    expect(typeof route.PUT).toBe("function");
  });

  it("in dev mode (local Inngest dev server) describes the app without any keys", async () => {
    vi.stubEnv("INNGEST_DEV", "1");
    vi.stubEnv("INNGEST_SIGNING_KEY", ""); // a key exported in the shell must not affect the test
    const { GET } = await loadRoute();
    const response = await GET(get(), undefined);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      mode: "dev",
      function_count: 3, // the try-on job + its onFailure handler ("run-tryon-failure", registered separately) + the cleanup cron
      has_signing_key: false,
    });
  });

  it("in production refuses to serve without INNGEST_SIGNING_KEY", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("INNGEST_DEV", "");
    vi.stubEnv("INNGEST_SIGNING_KEY", "");
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { GET } = await loadRoute();
    const response = await GET(get(), undefined);
    expect(response.status).toBe(500);
  });
});
