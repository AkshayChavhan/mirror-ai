import { clerk } from "@clerk/testing/playwright";
import { expect, test, type Page } from "@playwright/test";
import { E2E_USERS } from "../scripts/e2e-clerk";

// Live 3D (task 66) in a real browser: MediaPipe body tracking, the three.js garment, and the
// Content-Security-Policy that blocks MediaPipe's usage metrics to Google (the developer's choice, 2026-10-01).
// Chromium's fake camera shows a test pattern (no person), so the garment stays hidden and the page asks the
// user to step back. Launch options apply to the whole worker, so they're top level. No traces (session
// cookies; the repo is public).
test.use({
  trace: "off",
  permissions: ["camera"],
  launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] },
});

type WithCspLog = Window & { __cspBlocked?: string[] };

/** Our app and Clerk only: 'self', the Clerk instance's Frontend API, then Clerk's telemetry. */
const OUR_POLICY = /^connect-src 'self' https:\/\/[a-z0-9-]+\.clerk\.accounts\.dev https:\/\/clerk-telemetry\.com/;

test.describe("Live 3D try-on", () => {
  test.skip(!process.env.CLERK_TESTING_TOKEN, "needs Clerk development keys (see e2e/global-setup.ts)");

  /** Records every URL the Content-Security-Policy blocks, opens the home page and signs in there. */
  async function signInAtHome(page: Page) {
    await page.addInitScript(() => {
      const log: string[] = [];
      (window as WithCspLog).__cspBlocked = log;
      document.addEventListener("securitypolicyviolation", (event) => log.push(event.blockedURI));
    });
    const home = await page.goto("/"); // a public page that loads Clerk
    await clerk.signIn({ page, emailAddress: E2E_USERS.user });
    return home;
  }

  test("every page only lets the browser talk to our app and Clerk (no Google)", async ({ page }) => {
    const home = await signInAtHome(page);
    const studio = await page.goto("/tryon");
    for (const response of [home, studio]) {
      const policy = response?.headers()["content-security-policy"] ?? "";
      expect(policy).toMatch(OUR_POLICY);
      expect(policy).not.toContain("googleapis");
    }
  });

  test("tracks in the browser, then Take photo continues to the photo try-on, and MediaPipe's metrics are blocked", async ({ page }) => {
    test.slow(); // sign-in, MediaPipe's WASM + model and the metrics flush: ~17 s locally, more on CI
    await signInAtHome(page);
    // Like a real visit: the home page's link, a client-side navigation (no new page load). The page keeps
    // the home page's policy, which is why every page sends it.
    await page.getByRole("link", { name: "Try it on", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Try it on" })).toBeVisible();
    const firstPage = await page.evaluate(() => new URL(performance.getEntriesByType("navigation")[0].name).pathname);
    expect(firstPage).toBe("/");
    // Needs a garment: the seeded test database in CI, or any real product locally.
    test.skip(await page.getByText("There are no garments to try on yet").isVisible(), "no garments to try on");

    await page.getByRole("button", { name: "Live 3D" }).click();
    await expect(page.getByLabel("Live 3D camera")).toBeVisible();

    // MediaPipe (WASM + model) and three.js started: the fake camera has no person, so it asks to step back.
    await expect(page.getByText("Step back until we can see your shoulders.")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Live 3D isn't available on this device")).toHaveCount(0);

    await page.getByRole("button", { name: "Take photo" }).click();
    await expect(page.getByRole("img", { name: "Your photo" })).toBeVisible();
    await expect(page.getByLabel("Live 3D camera")).toHaveCount(0); // Live 3D closed

    // Closing the tracker makes MediaPipe flush its metrics to Google: the browser must have blocked that.
    await expect
      .poll(() => page.evaluate(() => (window as WithCspLog).__cspBlocked ?? []), { timeout: 15_000 })
      .toContainEqual(expect.stringContaining("odml.pa.googleapis.com"));
  });
});
