import { defineConfig, devices } from "@playwright/test";
import { assertSafeTestDatabase } from "./scripts/e2e-db";

// Port 3100 so E2E runs don't clash with `npm run dev` on 3000.
const PORT = 3100;
const BASE_URL = `http://localhost:${PORT}`;
// The throwaway test database (task 60). When set, it's seeded before the run and the app uses it.
const E2E_DATABASE_URL = process.env.E2E_DATABASE_URL;
// Check it before anything starts, so the app is never pointed at an unsafe (real) database.
if (E2E_DATABASE_URL) assertSafeTestDatabase(E2E_DATABASE_URL);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  // Fail the CI build if a `test.only` was left in the code.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: BASE_URL,
    // Record a trace only when a failed test is retried, to debug it later.
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Resets the test database to known sample data (only when E2E_DATABASE_URL is set).
  globalSetup: "./e2e/global-setup.ts",
  // Test the real production build, not the dev server.
  webServer: {
    command: `npm run build && npm run start -- -p ${PORT}`,
    url: BASE_URL,
    // With a test database, always start a fresh server: an old local one would still use .env's database.
    reuseExistingServer: !process.env.CI && !E2E_DATABASE_URL,
    timeout: 180_000,
    // Point the app at the test database. A variable already set wins over .env, so .env stays untouched.
    // Its garments live in Cloudinary's public "demo" account, so the app is built for that account too: its
    // images and (Live 3D, task 72) its 3D models are then allowed by next/image and the security policy.
    env: E2E_DATABASE_URL ? { DATABASE_URL: E2E_DATABASE_URL, CLOUDINARY_CLOUD_NAME: "demo" } : {},
  },
});
