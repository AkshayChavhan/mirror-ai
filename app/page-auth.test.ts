// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Pages are protected one by one (task 24), not in proxy.ts, so a single missed requireUser() leaves a page
// public. This guard reads every app/**/page.tsx: a page must be listed below as public, or its FIRST
// `await` must be requireUser() or requireAdmin(), so nothing is read before the auth check.
// Public pages come from docs/project-plan.md, "Pages and flow". Adding one here needs that table to agree.

const APP_DIR = join(process.cwd(), "app");

/** Page files that are public on purpose, with the reason. */
const PUBLIC_PAGES: Record<string, string> = {
  "page.tsx": "landing page: browsing garments is public",
  "wishlist/page.tsx": "wishlist works signed out (anonymous cookie)",
  "sign-in/[[...sign-in]]/page.tsx": "Clerk sign-in",
  "sign-up/[[...sign-up]]/page.tsx": "Clerk sign-up",
};

const AUTH_FIRST = /^await (requireUser|requireAdmin)\(\)/;

const PAGE_FILE = /(^|\/)page\.(tsx|ts|jsx|js)$/; // Next routes all four extensions by default

/** Every page file under app/, as a path relative to app/ with forward slashes. */
function allPages(): string[] {
  return readdirSync(APP_DIR, { recursive: true, encoding: "utf8" })
    .map((file) => file.split("\\").join("/"))
    .filter((file) => PAGE_FILE.test(file))
    .sort();
}

/**
 * True when the first `await` in the page component is the auth call. The search starts at
 * `export default`, so an `await requireUser()` in a helper above the page can't count for the page itself.
 */
function authComesFirst(source: string): boolean {
  const page = source.indexOf("export default");
  if (page === -1) return false;
  const first = source.indexOf("await ", page);
  return first !== -1 && AUTH_FIRST.test(source.slice(first));
}

describe("page protection (every page is public on purpose, or checks auth first)", () => {
  const pages = allPages();

  it("finds the app's pages", () => {
    expect(pages.length).toBeGreaterThanOrEqual(8);
  });

  it.each(pages.filter((page) => !(page in PUBLIC_PAGES)))("app/%s calls requireUser()/requireAdmin() first", (page) => {
    const source = readFileSync(join(APP_DIR, page), "utf8");
    expect(authComesFirst(source), `app/${page} must start with requireUser() or requireAdmin(), or be listed as public`).toBe(true);
  });

  it("lists only pages that exist (no stale public entries)", () => {
    for (const page of Object.keys(PUBLIC_PAGES)) expect(pages).toContain(page);
  });
});

describe("authComesFirst", () => {
  it.each([
    ["requireUser first", "export default async function P() {\n  const userId = await requireUser();\n  await load();\n}"],
    ["requireAdmin first", "export default async function P() {\n  await requireAdmin();\n  const { id } = await params;\n}"],
  ])("accepts %s", (_case, source) => {
    expect(authComesFirst(source)).toBe(true);
  });

  it.each([
    ["no auth at all", "export default async function P() {\n  const rows = await load();\n}"],
    ["data read before auth", "export default async function P() {\n  const rows = await load();\n  await requireUser();\n}"],
    ["no await at all", "export default function P() {\n  return null;\n}"],
    ["a different function with a similar name", "export default async function P() {\n  await requireUserMaybe();\n}"],
    [
      "auth only in a helper above the page (the page reads data first)",
      "async function helper() {\n  await requireUser();\n}\nexport default async function P() {\n  const rows = await load();\n}",
    ],
  ])("rejects %s", (_case, source) => {
    expect(authComesFirst(source)).toBe(false);
  });
});
