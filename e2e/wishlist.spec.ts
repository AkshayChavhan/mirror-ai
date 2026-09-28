import { expect, test } from "@playwright/test";

// Public page. A signed-out visitor with no cookie has saved nothing, so it shows the empty state without
// any database call (works in CI, which has no database), and viewing it never creates the cookie.
test("/wishlist is public and shows an empty wishlist to a new visitor", async ({ page, context }) => {
  const response = await page.goto("/wishlist");
  expect(response?.status()).toBe(200);
  await expect(page).toHaveURL(/\/wishlist$/); // no redirect to sign-in
  await expect(page.getByRole("heading", { level: 1, name: "Wishlist" })).toBeVisible();
  const saved = page.getByRole("region", { name: "Saved garments" });
  await expect(saved.getByText("Your wishlist is empty.")).toBeVisible();
  await expect(saved.getByRole("link", { name: "Browse garments" })).toHaveAttribute("href", "/");
  const cookies = await context.cookies();
  expect(cookies.map((c) => c.name)).not.toContain("mirror_anon_id");
});
