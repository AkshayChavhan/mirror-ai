// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

// next.config.ts reads CLOUDINARY_CLOUD_NAME when it loads, so re-import it for each case.
async function cloudinaryPathname(): Promise<string | undefined> {
  vi.resetModules();
  const config = (await import("./next.config")).default;
  const pattern = config.images?.remotePatterns?.[0];
  return pattern && !(pattern instanceof URL) ? pattern.pathname : undefined;
}

describe("next.config.ts images.remotePatterns", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("limits images to our own Cloudinary account when the cloud name is real", async () => {
    vi.stubEnv("CLOUDINARY_CLOUD_NAME", "my-cloud_1");
    await expect(cloudinaryPathname()).resolves.toBe("/my-cloud_1/**");
  });

  it.each([
    ["the .env.example placeholder", "<cloudinary-cloud-name>"],
    ["an empty value", ""],
    ["a value with a slash", "a/b"],
  ])("falls back to any path for %s", async (_label, value) => {
    vi.stubEnv("CLOUDINARY_CLOUD_NAME", value);
    await expect(cloudinaryPathname()).resolves.toBe("/**");
  });

  it("only allows https://res.cloudinary.com", async () => {
    vi.resetModules();
    const config = (await import("./next.config")).default;
    expect(config.images?.remotePatterns).toEqual([
      expect.objectContaining({ protocol: "https", hostname: "res.cloudinary.com" }),
    ]);
  });
});

describe("next.config.ts headers (task 66)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("sends every page a Content-Security-Policy that only allows our app and Clerk (blocks MediaPipe's metrics)", async () => {
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", `pk_test_${Buffer.from("example-instance-1.clerk.accounts.dev$").toString("base64")}`);
    vi.resetModules();
    const config = (await import("./next.config")).default;
    const rules = (await config.headers?.()) ?? [];
    expect(rules).toEqual([
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "connect-src 'self' https://example-instance-1.clerk.accounts.dev https://clerk-telemetry.com",
          },
        ],
      },
    ]);
  });

  it("covers every page, not just /tryon: the app's links reach /tryon without a new page load", async () => {
    vi.resetModules();
    const config = (await import("./next.config")).default;
    const sources = ((await config.headers?.()) ?? []).map((rule) => rule.source);
    expect(sources).toEqual(["/:path*"]); // also matches "/" (zero segments)
  });
});

describe("next.config.ts server action body size (task 67)", () => {
  it("fits an admin's 5 MB garment image AND 5 MB 3D model, plus the other fields", async () => {
    vi.resetModules();
    const config = (await import("./next.config")).default;
    expect(config.experimental?.serverActions?.bodySizeLimit).toBe("11mb");
  });

  it("lets the same size through the proxy (proxy.ts), which otherwise keeps only the first 10 MB", async () => {
    vi.resetModules();
    const config = (await import("./next.config")).default;
    expect(config.experimental?.proxyClientMaxBodySize).toBe("11mb");
  });
});
