import { clerk } from "@clerk/testing/playwright";
import { expect, test, type Page } from "@playwright/test";
import { E2E_USERS } from "../scripts/e2e-clerk";
import { E2E_DATA } from "../scripts/e2e-db";

// Signed-in pages, with the two Clerk test users (task 58). The global setup gets a Clerk testing token
// when the Clerk keys are available (CI secrets, or .env locally); without it these tests skip.
// No traces in this file: the repo is public and CI uploads failed runs' results, and a trace would hold the
// test users' session cookies (the admin's included). Top level, because trace is a per-worker option.
test.use({ trace: "off" });

test.describe("signed-in pages", () => {
  test.skip(!process.env.CLERK_TESTING_TOKEN, "needs Clerk development keys (see e2e/global-setup.ts)");
  // With the seeded test database (CI), the edit page of a real product: an admin gets the form, so a
  // non-admin's 404 there really comes from requireAdmin(), not from "no such product".
  const editPath = `/admin/products/${E2E_DATA.products.shirt.id}/edit`;
  const seeded = Boolean(process.env.E2E_DATABASE_URL);

  /** Signs in by email: @clerk/testing makes a one-time sign-in token with the secret key (no password). */
  async function signInAs(page: Page, emailAddress: string): Promise<void> {
    await page.goto("/"); // a public page that loads Clerk
    await clerk.signIn({ page, emailAddress });
  }

  test("a signed-in user can open their history", async ({ page }) => {
    await signInAs(page, E2E_USERS.user);
    await page.goto("/history");
    await expect(page).toHaveURL(/\/history$/); // not sent to sign-in
    await expect(page.getByRole("heading", { level: 1, name: "Your try-ons" })).toBeVisible();
  });

  test("a signed-in user can open the try-on page", async ({ page }) => {
    await signInAs(page, E2E_USERS.user);
    await page.goto("/tryon");
    await expect(page).toHaveURL(/\/tryon$/);
    await expect(page.getByRole("heading", { level: 1, name: "Try it on" })).toBeVisible();
  });

  test("a signed-in user who isn't an admin gets a 404 from the admin area (it isn't revealed)", async ({ page }) => {
    await signInAs(page, E2E_USERS.user);
    for (const path of ["/admin/products", "/admin/products/new", ...(seeded ? [editPath] : [])]) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(404);
      await expect(page.getByRole("heading", { name: "Products" })).toHaveCount(0);
    }
  });

  test("an admin can open the admin area", async ({ page }) => {
    await signInAs(page, E2E_USERS.admin);
    const response = await page.goto("/admin/products");
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: "Products" })).toBeVisible();
    if (seeded) {
      const edit = await page.goto(editPath);
      expect(edit?.status(), editPath).toBe(200); // the same page a non-admin gets a 404 from
    }
  });
});
