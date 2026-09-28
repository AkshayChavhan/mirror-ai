import { expect, test } from "@playwright/test";

// requireUser() runs before any database call, so this works without DATABASE_URL (CI).
test("signed-out visitors are sent from /history to sign-in", async ({ page }) => {
  await page.goto("/history");
  await expect(page).toHaveURL(/\/sign-in/);
  // Clerk remembers where to return after signing in.
  expect(decodeURIComponent(page.url())).toContain("/history");
});
