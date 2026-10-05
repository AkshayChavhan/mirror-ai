// @vitest-environment node
import { describe, expect, it } from "vitest";
import { clerkFrontendApiOrigin, cloudinaryModelSource, contentSecurityPolicy } from "./csp";

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
  it("only lets the page talk to our own app, Clerk and in-page blob: data: MediaPipe's metrics to Google are blocked", () => {
    const policy = contentSecurityPolicy(DEV_KEY, false);
    expect(policy).toBe("connect-src 'self' https://example-instance-1.clerk.accounts.dev https://clerk-telemetry.com blob:");
    expect(policy).not.toMatch(/googleapis|\*/);
  });

  it("restricts only connections, not scripts, styles or images (so nothing else on the page breaks)", () => {
    expect(contentSecurityPolicy(DEV_KEY, false)).not.toMatch(/script-src|style-src|img-src|default-src/);
  });

  it("allows WebSockets in development (Next's hot reload), never in production", () => {
    expect(contentSecurityPolicy(DEV_KEY, true)).toMatch(/ ws:$/);
    expect(contentSecurityPolicy(DEV_KEY, false)).not.toContain("ws:");
  });

  it("lets Live 3D download garment models from our own Cloudinary account's raw files only (task 72)", () => {
    const policy = contentSecurityPolicy(DEV_KEY, false, "my-cloud_1");
    expect(policy).toBe(
      "connect-src 'self' https://example-instance-1.clerk.accounts.dev https://clerk-telemetry.com blob: https://res.cloudinary.com/my-cloud_1/raw/upload/",
    );
    expect(policy).not.toMatch(/res\.cloudinary\.com(\/\*| |$)/); // never all of Cloudinary
  });

  it("allows blob: (textures inside a 3D model, which three.js unpacks to blob: URLs), but never data:", () => {
    const policy = contentSecurityPolicy(DEV_KEY, false);
    expect(policy.split(" ")).toContain("blob:");
    expect(policy).not.toContain("data:");
  });

  it.each([
    ["no cloud name", undefined],
    ["the .env.example placeholder", "<cloudinary-cloud-name>"],
    ["a value with a slash", "a/b"],
  ])("adds no Cloudinary source for %s", (_case, cloudName) => {
    expect(cloudinaryModelSource(cloudName)).toBeNull();
    expect(contentSecurityPolicy(DEV_KEY, false, cloudName)).not.toContain("cloudinary");
  });

  it("still blocks Google without a usable Clerk key", () => {
    expect(contentSecurityPolicy(undefined, false)).toBe("connect-src 'self' https://clerk-telemetry.com blob:");
  });
});
