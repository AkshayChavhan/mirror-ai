import { clerk } from "@clerk/testing/playwright";
import { expect, test, type Page } from "@playwright/test";
import { E2E_USERS } from "../scripts/e2e-clerk";
import { E2E_DATA } from "../scripts/e2e-db";

// The /tryon loading screen (task 43). A real try-on can't be started here (no Cloudinary keys in CI), so the
// page opens an already-started one from the address (?tryon=<id>) and the status endpoint's replies are faked
// with page.route; the endpoint itself has its own tests (task 40). No traces: session cookies (public repo).
test.use({ trace: "off" });

const TRYON_ID = "65f0c0ffee0000000000abcd";
const { products, shareIds, imageUrl } = E2E_DATA;

type Reply = Record<string, unknown>;

test.describe("the try-on loading screen", () => {
  // Needs a signed-in user (Clerk keys) and garments (the seeded test database), so it runs in CI.
  test.skip(
    !process.env.CLERK_TESTING_TOKEN || !process.env.E2E_DATABASE_URL,
    "needs Clerk development keys and the seeded test database (CI)",
  );

  /** Signs in, answers every status request with `reply()` (asked each time), and opens the loading screen. */
  async function watch(page: Page, reply: () => Reply): Promise<void> {
    await page.route(`**/api/tryon/${TRYON_ID}/status`, (route) =>
      route.fulfill({ json: reply(), headers: { "Cache-Control": "no-store" } }),
    );
    await page.goto("/"); // a public page that loads Clerk
    await clerk.signIn({ page, emailAddress: E2E_USERS.user });
    await page.goto(`/tryon?tryon=${TRYON_ID}`);
  }

  test("follows a try-on until it's done, then opens its result page, and Back doesn't bounce", async ({ page }) => {
    let done = false; // flipped by the test, so "Creating…" is seen however slowly the page loads
    await watch(page, () =>
      done
        ? { status: "DONE", resultUrl: imageUrl, errorMessage: null, shareId: shareIds.done }
        : { status: "PROCESSING", resultUrl: null, errorMessage: null, shareId: shareIds.done },
    );
    await expect(page.getByRole("status")).toHaveText("Creating your try-on… This can take a minute.");
    done = true;
    // The next check (up to 2.5 s away) says DONE, then the result page renders: extra time for a slow CI.
    await expect(page).toHaveURL(new RegExp(`/tryon/${shareIds.done}$`), { timeout: 10_000 });
    await expect(page.getByRole("heading", { level: 1, name: `Trying on: ${products.shirt.name}` })).toBeVisible();

    // The loading screen replaced itself in the history, so Back goes to the page before it (the landing page).
    await page.goBack();
    await expect(page.getByRole("region", { name: "Garments" })).toBeVisible();
    await expect(page).not.toHaveURL(/\/tryon/);
  });

  test("shows why a try-on failed, and Try again goes back to choosing a photo", async ({ page }) => {
    await watch(page, () => ({
      status: "FAILED",
      resultUrl: null,
      errorMessage: "Try-on is busy right now. Please try again later.",
      shareId: shareIds.failed,
    }));
    // By text: Next's route announcer is another (empty) role="alert" on every page.
    await expect(page.getByText("Try-on is busy right now. Please try again later.")).toBeVisible();
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page).toHaveURL(/\/tryon$/); // ?tryon= removed
    await expect(page.getByLabel("Choose a photo")).toBeEnabled();
  });
});
