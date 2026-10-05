import { clerk } from "@clerk/testing/playwright";
import { expect, test, type Page } from "@playwright/test";
import { E2E_USERS, redactClerkTokensInConsole } from "../scripts/e2e-clerk";

// The CI log is public: hide Clerk's short-lived session tokens in anything this worker prints (task 71).
redactClerkTokensInConsole();

// The /tryon camera (task 42) with Chromium's fake camera (a moving test pattern) and the permission already
// granted. Top level, because launch options apply to the whole worker. No traces: they'd hold the test
// user's session cookies, and the repo is public (see e2e/signed-in.spec.ts).
test.use({
  trace: "off",
  permissions: ["camera"],
  launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] },
});

test.describe("the try-on camera", () => {
  // Needs a signed-in user (Clerk keys) and garments to pick (the seeded test database), so it runs in CI.
  test.skip(
    !process.env.CLERK_TESTING_TOKEN || !process.env.E2E_DATABASE_URL,
    "needs Clerk development keys and the seeded test database (CI)",
  );

  async function openStudio(page: Page): Promise<void> {
    await page.goto("/"); // a public page that loads Clerk
    await clerk.signIn({ page, emailAddress: E2E_USERS.user });
    await page.goto("/tryon");
  }

  test("takes a photo with the camera, which then gets the usual preview and Try on", async ({ page }) => {
    await openStudio(page);
    await page.getByRole("button", { name: "Use camera" }).click();
    await expect(page.getByLabel("Camera preview")).toBeVisible();
    await expect(page.getByText("Stand back until your body fits the outline, facing the camera.")).toBeVisible();

    const take = page.getByRole("button", { name: "Take photo" });
    await expect(take).toBeEnabled(); // the camera is on
    await take.click();

    await expect(page.getByRole("img", { name: "Your photo" })).toBeVisible();
    await expect(page.getByLabel("Camera preview")).toHaveCount(0); // the camera closed
    await expect(page.getByRole("button", { name: /^Try on / })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Retake" })).toBeVisible();
  });

  test("Cancel closes the camera and goes back to the two choices", async ({ page }) => {
    await openStudio(page);
    await page.getByRole("button", { name: "Use camera" }).click();
    await expect(page.getByRole("button", { name: "Take photo" })).toBeEnabled();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByLabel("Camera preview")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Use camera" })).toBeVisible();
    await expect(page.getByText("Choose a photo")).toBeVisible();
  });
});
