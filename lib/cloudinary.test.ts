import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the Cloudinary SDK: unit tests never call the real service or use real keys.
const { upload, config } = vi.hoisted(() => ({ upload: vi.fn(), config: vi.fn() }));
vi.mock("cloudinary", () => ({ v2: { config, uploader: { upload } } }));

import { ImageUploadError, uploadImage } from "./cloudinary";

const FILE = "data:image/png;base64,iVBORw0KGgo=";

describe("uploadImage", () => {
  beforeEach(() => {
    vi.stubEnv("CLOUDINARY_CLOUD_NAME", "<test-cloud>");
    vi.stubEnv("CLOUDINARY_API_KEY", "<test-key>");
    vi.stubEnv("CLOUDINARY_API_SECRET", "<test-secret>");
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    upload.mockReset();
    config.mockReset();
  });

  it("uploads to the given folder and returns the image details", async () => {
    upload.mockResolvedValue({
      secure_url: "https://res.cloudinary.com/test/image/upload/v1/mirror-ai/garments/abc.png",
      public_id: "mirror-ai/garments/abc",
      width: 800,
      height: 1200,
    });

    await expect(uploadImage(FILE, "mirror-ai/garments")).resolves.toEqual({
      url: "https://res.cloudinary.com/test/image/upload/v1/mirror-ai/garments/abc.png",
      publicId: "mirror-ai/garments/abc",
      width: 800,
      height: 1200,
    });
    expect(upload).toHaveBeenCalledWith(FILE, { folder: "mirror-ai/garments", resource_type: "image" });
    expect(config).toHaveBeenCalledWith(
      expect.objectContaining({ cloud_name: "<test-cloud>", secure: true }),
    );
  });

  it.each(["", "   "])("rejects an empty file (%j) with a friendly message, without calling Cloudinary", async (file) => {
    await expect(uploadImage(file, "mirror-ai/garments")).rejects.toThrow("Please choose an image to upload.");
    expect(upload).not.toHaveBeenCalled();
  });

  it("fails with a friendly message when env vars are missing, and logs which ones", async () => {
    vi.stubEnv("CLOUDINARY_API_SECRET", "");

    const promise = uploadImage(FILE, "mirror-ai/garments");
    await expect(promise).rejects.toBeInstanceOf(ImageUploadError);
    await expect(promise).rejects.toThrow("Image upload isn't available right now.");
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("CLOUDINARY_API_SECRET"));
    expect(upload).not.toHaveBeenCalled();
  });

  it("hides provider errors from users but logs them on the server", async () => {
    const providerError = { message: "Invalid Signature 3f9a...", http_code: 401 };
    upload.mockRejectedValue(providerError);

    const error = await uploadImage(FILE, "mirror-ai/garments").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ImageUploadError);
    expect((error as ImageUploadError).message).toBe("We couldn't upload your image. Please try again.");
    expect((error as ImageUploadError).message).not.toContain("Signature");
    expect((error as ImageUploadError).cause).toBe(providerError);
    expect(console.error).toHaveBeenCalledWith("[cloudinary] Upload failed:", providerError);
  });
});
