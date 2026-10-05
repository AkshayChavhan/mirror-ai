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

// Task 71: @clerk/testing prints the URL of a Frontend API request that failed, for example one still in flight
// when a test ends ("route.fetch: Test ended"). Those URLs carry `__clerk_db_jwt`, a short-lived session token
// for the development instance, and the CI log is public. Its retried request also carries the testing token
// (`__clerk_testing_token`), which a Playwright network error can print with the request. The timing can't be
// reproduced on demand, so instead of trying to prevent every warning, signed-in specs redact both tokens in
// anything the test worker prints.

const CLERK_TOKEN = /((?:__clerk_db_jwt|__clerk_testing_token)=)[^&;,\s"'()<>]+/g;

/** `text` with every `__clerk_db_jwt` and `__clerk_testing_token` value replaced by "<redacted>". */
export function redactClerkTokens(text: string): string {
  return text.replace(CLERK_TOKEN, "$1<redacted>");
}

function redactArgument(arg: unknown): unknown {
  if (typeof arg === "string") return redactClerkTokens(arg);
  if (arg instanceof Error) {
    const copy = new Error(redactClerkTokens(arg.message));
    copy.stack = arg.stack === undefined ? undefined : redactClerkTokens(arg.stack);
    return copy;
  }
  return arg;
}

type ConsoleLike = Pick<Console, "log" | "info" | "warn" | "error" | "debug">;
const LEVELS = ["log", "info", "warn", "error", "debug"] as const;
const redacted = new WeakSet<object>();

/**
 * Makes `target` (the test worker's console) redact Clerk tokens in strings and errors before printing them.
 * Call it at the top of every signed-in spec; calling it again for the same console does nothing.
 */
export function redactClerkTokensInConsole(target: ConsoleLike = console): void {
  if (redacted.has(target)) return;
  redacted.add(target);
  for (const level of LEVELS) {
    const print = target[level].bind(target);
    target[level] = (...args: unknown[]) => print(...args.map(redactArgument));
  }
}
