import { expect, test } from "@playwright/test";

// Real Clerk components with the test-mode keys (.env locally, repo secrets in CI).
// Clerk's widget loads from Clerk's servers, so allow extra time for it to appear.
for (const { path, name } of [
  { path: "/sign-in", name: "sign-in" },
  { path: "/sign-up", name: "sign-up" },
]) {
  test(`${name} page loads and shows Clerk's form`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page.locator(".cl-rootBox")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("textbox").first()).toBeVisible({ timeout: 20_000 });
  });
}
