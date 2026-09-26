import { expect, test } from "@playwright/test";

// proxy.ts runs Clerk's middleware on page requests (it marks responses with x-clerk-auth-status)
// and must keep public pages public. Protected pages arrive with their own tasks (requireUser()).
test.describe("proxy.ts (Clerk middleware)", () => {
  for (const path of ["/", "/sign-in", "/sign-up"]) {
    test(`${path} stays public for signed-out visitors`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      expect(new URL(page.url()).pathname).toBe(path);
    });
  }

  test("Clerk's middleware runs on page requests", async ({ request }) => {
    const response = await request.get("/", { maxRedirects: 0 });
    expect(response.headers()["x-clerk-auth-status"]).toBe("signed-out");
  });

  test("static files are skipped by the matcher", async ({ request }) => {
    const response = await request.get("/favicon.ico", { maxRedirects: 0 });
    expect(response.status()).toBe(200);
    expect(response.headers()["x-clerk-auth-status"]).toBeUndefined();
  });
});
