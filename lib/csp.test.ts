// @vitest-environment node
import { describe, expect, it } from "vitest";
import { clerkFrontendApiOrigin, contentSecurityPolicy } from "./csp";

// A fake publishable key in Clerk's format: pk_test_ + base64("<host>$"). Not a real instance.
const key = (host: string, kind = "test") => `pk_${kind}_${Buffer.from(`${host}$`).toString("base64")}`;
const DEV_KEY = key("example-instance-1.clerk.accounts.dev");

describe("clerkFrontendApiOrigin", () => {
  it("reads Clerk's Frontend API host out of a publishable key", () => {
    expect(clerkFrontendApiOrigin(DEV_KEY)).toBe("https://example-instance-1.clerk.accounts.dev");
    expect(clerkFrontendApiOrigin(key("clerk.mirror.example", "live"))).toBe("https://clerk.mirror.example");
  });

  it.each([
    ["no key", undefined],
    ["the .env.example placeholder", "<clerk-publishable-key>"],
    ["a secret key", "sk_test_x"],
    ["a key that doesn't decode to a host", `pk_test_${Buffer.from("not a host; evil$").toString("base64")}`],
  ])("gives null for %s", (_case, value) => {
    expect(clerkFrontendApiOrigin(value)).toBeNull();
  });
});

describe("contentSecurityPolicy", () => {
  it("only lets the page talk to our own app and Clerk: MediaPipe's metrics to Google are blocked", () => {
    const policy = contentSecurityPolicy(DEV_KEY, false);
    expect(policy).toBe("connect-src 'self' https://example-instance-1.clerk.accounts.dev https://clerk-telemetry.com");
    expect(policy).not.toMatch(/googleapis|\*/);
  });

  it("restricts only connections, not scripts, styles or images (so nothing else on the page breaks)", () => {
    expect(contentSecurityPolicy(DEV_KEY, false)).not.toMatch(/script-src|style-src|img-src|default-src/);
  });

  it("allows WebSockets in development (Next's hot reload), never in production", () => {
    expect(contentSecurityPolicy(DEV_KEY, true)).toMatch(/ ws:$/);
    expect(contentSecurityPolicy(DEV_KEY, false)).not.toContain("ws:");
  });

  it("still blocks Google without a usable Clerk key", () => {
    expect(contentSecurityPolicy(undefined, false)).toBe("connect-src 'self' https://clerk-telemetry.com");
  });
});
