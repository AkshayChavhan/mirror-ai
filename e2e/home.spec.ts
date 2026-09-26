import { expect, test } from "@playwright/test";

test.describe("Home page", () => {
  test("loads and shows the Mirror AI heading", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Mirror AI");
  });

  test("has the Mirror AI title and description", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle("Mirror AI");
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      "content",
      "Virtual try-on: see how clothes look on you before you buy.",
    );
  });
});
