import { expect, test } from "@playwright/test";

test.describe("Home page", () => {
  test("loads and shows the main heading", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("has the page title from the root layout", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle("Create Next App");
  });
});
