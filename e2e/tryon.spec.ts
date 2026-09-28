import { expect, test } from "@playwright/test";

// requireUser() runs before any database call, so this works without DATABASE_URL (CI).
test("signed-out visitors are sent from /tryon to sign-in, keeping the chosen garment", async ({ page }) => {
  await page.goto("/tryon?product=65f0c0ffee0000000000abcd");
  await expect(page).toHaveURL(/\/sign-in/);
  // Clerk remembers where to return after signing in, including the ?product= choice.
  expect(decodeURIComponent(page.url())).toContain("/tryon?product=65f0c0ffee0000000000abcd");
});
