import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";

// Signed-in E2E tests (task 58) use @clerk/testing. The two test users live in the developer's Clerk
// DEVELOPMENT instance. Their emails use Clerk's "+clerk_test" format, so no real email is ever sent.

export const E2E_USERS = {
  user: "e2e-user+clerk_test@example.com",
  admin: "e2e-admin+clerk_test@example.com", // publicMetadata { "role": "admin" }, set in the Clerk dashboard
} as const;

const CLERK_KEYS = ["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "CLERK_SECRET_KEY"] as const;

/**
 * Puts the two Clerk keys into process.env when they aren't set yet (CI sets them; locally they're in
 * .env.local or .env, the first file wins). ONLY these two: nothing else in those files is loaded, e.g.
 * never a DATABASE_URL or E2E_DATABASE_URL. Returns true when both keys are set.
 */
export function loadClerkKeys(files: readonly string[] = [".env.local", ".env"]): boolean {
  for (const file of files) {
    if (!existsSync(file)) continue;
    const values = parseEnv(readFileSync(file, "utf8"));
    for (const key of CLERK_KEYS) {
      const value = values[key];
      if (!process.env[key] && value) process.env[key] = value;
    }
  }
  return CLERK_KEYS.every((key) => Boolean(process.env[key]));
}

/**
 * Throws unless the secret key belongs to a DEVELOPMENT instance (sk_test_...). The tests create sign-in
 * tokens with it, which must never happen for real users. The error never repeats the key.
 */
export function assertTestClerkKey(secretKey: string): void {
  if (!secretKey.startsWith("sk_test_")) {
    throw new Error("Refusing to run signed-in E2E tests: CLERK_SECRET_KEY isn't a development (sk_test_) key.");
  }
}
