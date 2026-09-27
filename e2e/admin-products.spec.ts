import { expect, test } from "@playwright/test";

// requireAdmin() runs before any database call, so these work without DATABASE_URL.
for (const path of ["/admin/products", "/admin/products/new", "/admin/products/65f0c0ffee0000000000abcd/edit"]) {
  test(`signed-out visitors are sent from ${path} to sign-in`, async ({ page }) => {
    await page.goto(path);
    await expect(page).toHaveURL(/\/sign-in/);
    // Clerk remembers where to return after signing in.
    expect(decodeURIComponent(page.url())).toContain(path);
  });
}
