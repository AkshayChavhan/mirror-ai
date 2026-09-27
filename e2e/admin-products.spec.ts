import { expect, test } from "@playwright/test";

// requireAdmin() runs before any database call, so this works without DATABASE_URL.
test("signed-out visitors are sent from /admin/products to sign-in", async ({ page }) => {
  await page.goto("/admin/products");
  await expect(page).toHaveURL(/\/sign-in/);
  // Clerk remembers where to return after signing in.
  expect(decodeURIComponent(page.url())).toContain("/admin/products");
});
