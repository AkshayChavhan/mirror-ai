import { expect, test } from "@playwright/test";
import { E2E_DATA } from "../scripts/e2e-db";

// Pages with real data, from the seeded E2E test database (task 60). CI provides the database;
// without E2E_DATABASE_URL (e.g. a laptop with no local MongoDB) these tests are skipped, not failed.
test.describe("pages backed by the seeded test database", () => {
  test.skip(!process.env.E2E_DATABASE_URL, "needs the E2E test database (E2E_DATABASE_URL, task 60)");

  const { products, shareIds, anonymousId } = E2E_DATA;

  test("the landing page lists the visible garments, never the hidden one", async ({ page }) => {
    await page.goto("/");
    const garments = page.getByRole("region", { name: "Garments" });
    await expect(garments.getByRole("heading", { name: products.shirt.name })).toBeVisible();
    await expect(garments.getByRole("heading", { name: products.dress.name })).toBeVisible();
    await expect(garments.getByText(products.hidden.name)).toHaveCount(0);
  });

  test("a finished try-on's public link shows the before/after slider and a download", async ({ page }) => {
    const response = await page.goto(`/tryon/${shareIds.done}`);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: `Trying on: ${products.shirt.name}` })).toBeVisible();
    await expect(page.getByRole("slider", { name: "Compare before and after" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Download the result" })).toHaveAttribute("href", /fl_attachment/);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  });

  test("a finished try-on's public link can be shared on WhatsApp (task 45)", async ({ page, baseURL }) => {
    await page.goto(`/tryon/${shareIds.done}`);
    // The link appears once the page runs in the browser (it needs the page's address).
    const share = page.getByRole("link", { name: "Share on WhatsApp" });
    await expect(share).toHaveAttribute("href", /^https:\/\/wa\.me\/\?text=/);
    await expect(share).toHaveAttribute("target", "_blank");
    const text = new URL((await share.getAttribute("href")) ?? "").searchParams.get("text");
    expect(text).toBe(`See this ${products.shirt.name} try-on on Mirror AI: ${baseURL}/tryon/${shareIds.done}`);
  });

  test("a failed try-on's public link says so, with no photos or share", async ({ page }) => {
    await page.goto(`/tryon/${shareIds.failed}`);
    await expect(page.getByText("This try-on didn't work.")).toBeVisible();
    await expect(page.getByRole("slider")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Share on WhatsApp" })).toHaveCount(0);
  });

  test("a signed-out visitor with the anonymous cookie sees their saved garments, not hidden ones", async ({
    page,
    context,
    baseURL,
  }) => {
    await context.addCookies([{ name: "mirror_anon_id", value: anonymousId, url: baseURL ?? "http://localhost:3100" }]);
    await page.goto("/wishlist");
    const saved = page.getByRole("region", { name: "Saved garments" });
    await expect(saved.getByRole("heading", { name: products.shirt.name })).toBeVisible();
    await expect(saved.getByRole("heading", { name: products.dress.name })).toBeVisible();
    await expect(saved.getByText(products.hidden.name)).toHaveCount(0);
    await expect(saved.getByRole("button", { name: `Remove ${products.shirt.name} from wishlist` })).toBeVisible();
  });
});
