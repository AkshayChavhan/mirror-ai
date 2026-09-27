import { expect, test } from "@playwright/test";

test.describe("Home page", () => {
  test("loads and shows the Mirror AI heading", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Mirror AI");
  });

  test("has a Try it on button and a garments section", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Try it on", exact: true })).toHaveAttribute("href", "/tryon");
    // Scope to the section: Next.js also renders a route announcer with role="alert".
    const garments = page.getByRole("region", { name: "Garments" });
    await expect(garments).toBeVisible();
    // Without a database (CI) the section shows a friendly message instead of crashing the page.
    await expect(
      garments.getByRole("alert").or(garments.getByText("New garments are coming soon.")).or(garments.getByRole("list")),
    ).toBeVisible();
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
