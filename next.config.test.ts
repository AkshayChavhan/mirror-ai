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
