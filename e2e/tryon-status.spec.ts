import { expect, test } from "@playwright/test";

// On the real production build, through Clerk's proxy.ts: a signed-out visitor gets a JSON 401 (not a
// redirect or an HTML page), before any database lookup, so this works in CI without a database.
test("/api/tryon/[id]/status refuses signed-out visitors with a JSON 401", async ({ request }) => {
  const response = await request.get("/api/tryon/65f0c0ffee0000000000abcd/status");
  expect(response.status()).toBe(401);
  expect(await response.json()).toEqual({ error: "Please sign in." });
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(response.headers()["x-clerk-auth-status"]).toBe("signed-out");
});
