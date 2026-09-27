import { expect, test } from "@playwright/test";

// The production build runs without INNGEST_SIGNING_KEY here and in CI, so Inngest refuses safely.
// The Clerk header proves proxy.ts ran on /api/inngest without blocking it.
test("/api/inngest reaches Inngest through the Clerk proxy and refuses without a signing key", async ({ request }) => {
  const response = await request.get("/api/inngest");
  expect(response.status()).toBe(500);
  expect(await response.json()).toEqual({ code: "internal_server_error" });
  expect(response.headers()["x-clerk-auth-status"]).toBe("signed-out");
});
