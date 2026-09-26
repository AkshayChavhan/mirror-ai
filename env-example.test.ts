import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const EXPECTED_KEYS = [
  "DATABASE_URL",
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "CLERK_SECRET_KEY",
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
  "HF_TOKEN",
  "INNGEST_EVENT_KEY",
  "INNGEST_SIGNING_KEY",
];

function parseEnvExample(): Map<string, string> {
  const vars = new Map<string, string>();
  for (const line of readFileSync(".env.example", "utf8").split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)="(.*)"$/);
    if (match) vars.set(match[1], match[2]);
  }
  return vars;
}

function isGitIgnored(path: string): boolean {
  try {
    execFileSync("git", ["check-ignore", "-q", path]);
    return true;
  } catch {
    return false;
  }
}

describe(".env.example", () => {
  const vars = parseEnvExample();

  it("lists every env var the app needs", () => {
    expect([...vars.keys()].sort()).toEqual([...EXPECTED_KEYS].sort());
  });

  it("contains placeholders only, never real values", () => {
    for (const [key, value] of vars) {
      expect(value, `${key} must use a <placeholder>`).toMatch(/<[a-z-]+>/);
      // With the placeholders removed, no long token-like run may remain (e.g. "hf_abc123...<x>").
      const rest = value.replace(/<[a-z-]+>/g, "");
      expect(rest, `${key} has a token-like value outside the placeholder`).not.toMatch(
        /[A-Za-z0-9_]{16,}/,
      );
    }
  });

  it("is committed, while real .env files stay git-ignored", () => {
    expect(isGitIgnored(".env.example")).toBe(false);
    expect(isGitIgnored(".env")).toBe(true);
    expect(isGitIgnored(".env.local")).toBe(true);
  });
});
