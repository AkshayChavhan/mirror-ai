import { expect, test } from "@playwright/test";

// The result page is public by link, and only a random share token works. An ObjectId is rejected before
// any database call, so this runs in CI without a database.
test("/tryon/<ObjectId> is a public, friendly 404 (never a redirect to sign-in)", async ({ page }) => {
  const response = await page.goto("/tryon/65f0c0ffee0000000000abcd");
  expect(response?.status()).toBe(404);
  await expect(page).toHaveURL(/\/tryon\/65f0c0ffee0000000000abcd$/);
  await expect(page.getByRole("heading", { level: 1, name: "This try-on isn't available" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Try Mirror AI yourself" })).toHaveAttribute("href", "/");
});
