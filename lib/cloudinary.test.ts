import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the Cloudinary SDK: unit tests never call the real service or use real keys.
const { upload, destroy, resources, config } = vi.hoisted(() => ({
  upload: vi.fn(),
  destroy: vi.fn(),
  resources: vi.fn(),
  config: vi.fn(),
}));
vi.mock("cloudinary", () => ({ v2: { config, uploader: { upload, destroy }, api: { resources } } }));

import {
  ImageUploadError,
  deleteImage,
  deleteModel,
  downloadUrl,
  listImages,
  modelPublicIdFromUrl,
  publicIdFromUrl,
  uploadImage,
  uploadModel,
} from "./cloudinary";

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

  it("with stripMetadata, strips EXIF/GPS before the image is stored", async () => {
    upload.mockResolvedValue({ secure_url: "https://x", public_id: "mirror-ai/people/me", width: 1, height: 1 });
    await uploadImage(FILE, "mirror-ai/people", { stripMetadata: true });
    expect(upload).toHaveBeenCalledWith(FILE, {
      folder: "mirror-ai/people",
      resource_type: "image",
      transformation: [{ flags: "force_strip" }],
    });
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

describe("deleteImage", () => {
  const PUBLIC_ID = "mirror-ai/people/abc";

  beforeEach(() => {
    vi.stubEnv("CLOUDINARY_CLOUD_NAME", "<test-cloud>");
    vi.stubEnv("CLOUDINARY_API_KEY", "<test-key>");
    vi.stubEnv("CLOUDINARY_API_SECRET", "<test-secret>");
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    destroy.mockReset();
    config.mockReset();
  });

  it("deletes the image and clears it from the CDN cache", async () => {
    destroy.mockResolvedValue({ result: "ok" });
    await expect(deleteImage(PUBLIC_ID)).resolves.toBe(true);
    expect(destroy).toHaveBeenCalledWith(PUBLIC_ID, { resource_type: "image", invalidate: true });
  });

  it("counts an image that is already gone as deleted", async () => {
    destroy.mockResolvedValue({ result: "not found" });
    await expect(deleteImage(PUBLIC_ID)).resolves.toBe(true);
  });

  it("returns false and logs when Cloudinary reports another result", async () => {
    destroy.mockResolvedValue({ result: "error" });
    await expect(deleteImage(PUBLIC_ID)).resolves.toBe(false);
    expect(console.error).toHaveBeenCalledWith(`[cloudinary] Delete of ${PUBLIC_ID} returned:`, { result: "error" });
  });

  it("never throws: returns false and logs when the call fails", async () => {
    const providerError = { message: "Invalid Signature 3f9a...", http_code: 401 };
    destroy.mockRejectedValue(providerError);
    await expect(deleteImage(PUBLIC_ID)).resolves.toBe(false);
    expect(console.error).toHaveBeenCalledWith(`[cloudinary] Delete of ${PUBLIC_ID} failed:`, providerError);
  });

  it("returns false without calling Cloudinary when env vars are missing", async () => {
    vi.stubEnv("CLOUDINARY_API_KEY", "");
    await expect(deleteImage(PUBLIC_ID)).resolves.toBe(false);
    expect(destroy).not.toHaveBeenCalled();
  });

  it("returns false for an empty public id", async () => {
    await expect(deleteImage("  ")).resolves.toBe(false);
    expect(destroy).not.toHaveBeenCalled();
  });
});

describe("listImages", () => {
  const PREFIX = "mirror-ai/people/";
  const listed = (publicId: string) => ({ public_id: publicId, created_at: "2026-09-28T10:00:00Z", bytes: 1234 });

  beforeEach(() => {
    vi.stubEnv("CLOUDINARY_CLOUD_NAME", "<test-cloud>");
    vi.stubEnv("CLOUDINARY_API_KEY", "<test-key>");
    vi.stubEnv("CLOUDINARY_API_SECRET", "<test-secret>");
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    resources.mockReset();
    config.mockReset();
  });

  it("lists one page (up to 500) of the uploaded images under a folder, with their upload times", async () => {
    resources.mockResolvedValue({ resources: [listed("mirror-ai/people/a")], next_cursor: "cursor-2" });
    await expect(listImages(PREFIX)).resolves.toEqual({
      images: [{ publicId: "mirror-ai/people/a", createdAt: "2026-09-28T10:00:00Z" }],
      nextCursor: "cursor-2",
    });
    expect(resources).toHaveBeenCalledWith({ type: "upload", resource_type: "image", prefix: PREFIX, max_results: 500 });
  });

  it("asks for the next page with the cursor, and says when there is none", async () => {
    resources.mockResolvedValue({ resources: [listed("mirror-ai/people/b")] });
    await expect(listImages(PREFIX, "cursor-2")).resolves.toMatchObject({ nextCursor: null });
    expect(resources).toHaveBeenCalledWith(expect.objectContaining({ next_cursor: "cursor-2" }));
  });

  it("skips listed items without a public id or an upload time", async () => {
    resources.mockResolvedValue({ resources: [listed("mirror-ai/people/c"), { public_id: "x" }, null, { created_at: "2026" }] });
    await expect(listImages(PREFIX)).resolves.toMatchObject({ images: [{ publicId: "mirror-ai/people/c" }] });
  });

  it("throws when the reply isn't an image list", async () => {
    resources.mockResolvedValue({ error: { message: "odd" } });
    await expect(listImages(PREFIX)).rejects.toThrow("something other than an image list");
  });

  it("throws, without calling Cloudinary, when env vars are missing", async () => {
    vi.stubEnv("CLOUDINARY_API_SECRET", "");
    await expect(listImages(PREFIX)).rejects.toBeInstanceOf(ImageUploadError);
    expect(resources).not.toHaveBeenCalled();
  });

  it("lets a provider error through, for the caller to log", async () => {
    resources.mockRejectedValue({ message: "Rate Limit Exceeded", http_code: 420 });
    await expect(listImages(PREFIX)).rejects.toEqual({ message: "Rate Limit Exceeded", http_code: 420 });
  });
});

describe("publicIdFromUrl", () => {
  it.each([
    ["a stored upload URL with a version", "https://res.cloudinary.com/demo/image/upload/v1712345678/mirror-ai/people/abc123.jpg", "mirror-ai/people/abc123"],
    ["a URL without a version", "https://res.cloudinary.com/demo/image/upload/mirror-ai/results/r.png", "mirror-ai/results/r"],
    ["an escaped character", "https://res.cloudinary.com/demo/image/upload/v1/mirror-ai/people/a%20b.webp", "mirror-ai/people/a b"],
  ])("reads the public id from %s", (_case, url, id) => {
    expect(publicIdFromUrl(url)).toBe(id);
  });

  it.each([
    ["not a URL", "nope"],
    ["plain http", "http://res.cloudinary.com/demo/image/upload/v1/mirror-ai/people/a.jpg"],
    ["another host", "https://evil.example.com/demo/image/upload/v1/mirror-ai/people/a.jpg"],
    ["a video URL", "https://res.cloudinary.com/demo/video/upload/v1/mirror-ai/people/a.mp4"],
    ["no file extension", "https://res.cloudinary.com/demo/image/upload/v1/mirror-ai/people/a"],
    ["a broken escape", "https://res.cloudinary.com/demo/image/upload/v1/mirror-ai/people/%E0%A4%A.jpg"],
  ])("returns null for %s", (_case, url) => {
    expect(publicIdFromUrl(url)).toBeNull();
  });
});

describe("downloadUrl", () => {
  it("serves a Cloudinary image as a download (fl_attachment)", () => {
    expect(downloadUrl("https://res.cloudinary.com/demo/image/upload/v1712345678/mirror-ai/results/r.png")).toBe(
      "https://res.cloudinary.com/demo/image/upload/fl_attachment/v1712345678/mirror-ai/results/r.png",
    );
  });

  it.each([["not a URL", "nope"], ["another host", "https://example.com/image/upload/v1/r.png"]])(
    "returns null for %s",
    (_case, url) => {
      expect(downloadUrl(url)).toBeNull();
    },
  );
});

describe("uploadModel (task 67)", () => {
  const MODEL = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0]); // starts like a .glb ("glTF", version 2)

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

  it("uploads the bytes unchanged as a raw file to the given folder", async () => {
    upload.mockResolvedValue({ secure_url: "https://res.cloudinary.com/test/raw/upload/v1/mirror-ai/models/m1", public_id: "mirror-ai/models/m1" });
    await expect(uploadModel(MODEL, "mirror-ai/models")).resolves.toEqual({
      url: "https://res.cloudinary.com/test/raw/upload/v1/mirror-ai/models/m1",
      publicId: "mirror-ai/models/m1",
    });
    const [file, options] = upload.mock.calls[0] as [string, unknown];
    expect(options).toEqual({ folder: "mirror-ai/models", resource_type: "raw" });
    expect(file).toBe(`data:model/gltf-binary;base64,${Buffer.from(MODEL).toString("base64")}`);
  });

  it("sends only the model's own bytes when they're a view into a bigger buffer", async () => {
    upload.mockResolvedValue({ secure_url: "https://x", public_id: "m" });
    const padded = new Uint8Array(MODEL.length + 3);
    padded.set(MODEL, 3);
    await uploadModel(padded.subarray(3), "mirror-ai/models");
    expect(upload.mock.calls[0][0]).toBe(`data:model/gltf-binary;base64,${Buffer.from(MODEL).toString("base64")}`);
  });

  it("refuses an empty file without calling Cloudinary", async () => {
    await expect(uploadModel(new Uint8Array(), "mirror-ai/models")).rejects.toThrow("Please choose a 3D model to upload.");
    expect(upload).not.toHaveBeenCalled();
  });

  it("fails with a friendly message when env vars are missing", async () => {
    vi.stubEnv("CLOUDINARY_API_KEY", "");
    await expect(uploadModel(MODEL, "mirror-ai/models")).rejects.toBeInstanceOf(ImageUploadError);
    expect(upload).not.toHaveBeenCalled();
  });

  it("hides provider errors from admins but logs them on the server", async () => {
    const providerError = { message: "File size too large. Got 11000000. Maximum is 10485760.", http_code: 400 };
    upload.mockRejectedValue(providerError);
    const error = await uploadModel(MODEL, "mirror-ai/models").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ImageUploadError);
    expect((error as ImageUploadError).message).toBe("We couldn't upload the 3D model. Please try again.");
    expect(console.error).toHaveBeenCalledWith("[cloudinary] Model upload failed:", providerError);
  });
});

describe("deleteModel (task 67)", () => {
  beforeEach(() => {
    vi.stubEnv("CLOUDINARY_CLOUD_NAME", "<test-cloud>");
    vi.stubEnv("CLOUDINARY_API_KEY", "<test-key>");
    vi.stubEnv("CLOUDINARY_API_SECRET", "<test-secret>");
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    destroy.mockReset();
    config.mockReset();
  });

  it("deletes the raw file and clears it from the CDN cache; already gone counts as deleted", async () => {
    destroy.mockResolvedValue({ result: "ok" });
    await expect(deleteModel("mirror-ai/models/m1")).resolves.toBe(true);
    expect(destroy).toHaveBeenCalledWith("mirror-ai/models/m1", { resource_type: "raw", invalidate: true });
    destroy.mockResolvedValue({ result: "not found" });
    await expect(deleteModel("mirror-ai/models/m1")).resolves.toBe(true);
  });

  it("never throws: returns false and logs when the call fails", async () => {
    destroy.mockRejectedValue({ message: "Invalid Signature", http_code: 401 });
    await expect(deleteModel("mirror-ai/models/m1")).resolves.toBe(false);
    expect(console.error).toHaveBeenCalled();
  });
});

describe("modelPublicIdFromUrl (task 67)", () => {
  it.each([
    ["a stored raw URL with a version", "https://res.cloudinary.com/demo/raw/upload/v1712345678/mirror-ai/models/abc123", "mirror-ai/models/abc123"],
    ["a URL without a version", "https://res.cloudinary.com/demo/raw/upload/mirror-ai/models/abc123", "mirror-ai/models/abc123"],
    ["an extension (part of a raw file's id)", "https://res.cloudinary.com/demo/raw/upload/v1/mirror-ai/models/shirt.glb", "mirror-ai/models/shirt.glb"],
  ])("reads the public id from %s", (_case, url, id) => {
    expect(modelPublicIdFromUrl(url)).toBe(id);
  });

  it.each([
    ["not a URL", "nope"],
    ["plain http", "http://res.cloudinary.com/demo/raw/upload/v1/mirror-ai/models/m"],
    ["another host", "https://evil.example.com/demo/raw/upload/v1/mirror-ai/models/m"],
    ["an image URL", "https://res.cloudinary.com/demo/image/upload/v1/mirror-ai/garments/a.png"],
    ["a broken escape", "https://res.cloudinary.com/demo/raw/upload/v1/mirror-ai/models/%E0%A4%A"],
  ])("returns null for %s", (_case, url) => {
    expect(modelPublicIdFromUrl(url)).toBeNull();
  });
});
