import { seedTestDatabase } from "../scripts/e2e-db";

// Runs once before all E2E tests (playwright.config.ts → globalSetup).
// With E2E_DATABASE_URL set (CI, task 60), the test database is reset to known sample data.
// Without it (e.g. on a laptop with no local MongoDB), nothing happens and the specs that need
// the data skip themselves.
export default async function globalSetup(): Promise<void> {
  const url = process.env.E2E_DATABASE_URL;
  if (!url) {
    console.log("[e2e] No E2E_DATABASE_URL: skipping the test-database seed (data-backed specs will skip).");
    return;
  }
  await seedTestDatabase(url); // refuses anything that isn't a local "...-e2e" database
  console.log("[e2e] Seeded the E2E test database.");
}
