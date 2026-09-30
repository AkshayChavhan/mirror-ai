import { clerkSetup } from "@clerk/testing/playwright";
import { assertTestClerkKey, loadClerkKeys } from "../scripts/e2e-clerk";
import { seedTestDatabase } from "../scripts/e2e-db";

// Runs once before all E2E tests (playwright.config.ts → globalSetup). Environment variables set here
// reach the tests too.

/** With E2E_DATABASE_URL set (CI, task 60), resets the test database to known sample data. */
async function seedIfConfigured(): Promise<void> {
  const url = process.env.E2E_DATABASE_URL;
  if (!url) {
    console.log("[e2e] No E2E_DATABASE_URL: skipping the test-database seed (data-backed specs will skip).");
    return;
  }
  await seedTestDatabase(url); // refuses anything that isn't a local "...-e2e" database
  console.log("[e2e] Seeded the E2E test database.");
}

/**
 * With Clerk's development keys (CI secrets, or .env locally), gets a Clerk testing token (task 58), so the
 * signed-in specs can sign in the test users. Without the keys, those specs skip themselves.
 */
async function setUpClerkIfConfigured(): Promise<void> {
  if (!loadClerkKeys()) {
    // In CI the signed-in specs must run, never skip quietly: the keys come from the repo's secrets.
    if (process.env.CI) throw new Error("[e2e] CI needs the Clerk secrets (NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY).");
    console.log("[e2e] No Clerk keys: skipping the signed-in specs.");
    return;
  }
  assertTestClerkKey(process.env.CLERK_SECRET_KEY ?? "");
  // dotenv: false, because loadClerkKeys already read only the two keys (the default would load all of .env).
  await clerkSetup({ dotenv: false }); // sets CLERK_FAPI and CLERK_TESTING_TOKEN for the tests; throws on failure
  console.log("[e2e] Clerk testing token ready: the signed-in specs will run.");
}

export default async function globalSetup(): Promise<void> {
  await seedIfConfigured();
  await setUpClerkIfConfigured();
}
