import { v2 as cloudinary, type UploadApiResponse } from "cloudinary";

// Server-only: reads secret env vars. Never import this from a "use client" file.

export type UploadedImage = {
  url: string;
  publicId: string;
  width: number;
  height: number;
};

/** Thrown for any upload problem. `message` is safe to show users; details are logged on the server. */
export class ImageUploadError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ImageUploadError";
  }
}

const REQUIRED_ENV = ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"] as const;

function configure(): void {
  const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error(`[cloudinary] Missing env vars: ${missing.join(", ")}`);
    throw new ImageUploadError("Image upload isn't available right now. Please try again later.");
  }
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

export type UploadOptions = {
  /**
   * Store a copy with no EXIF/IPTC/XMP metadata (GPS location, device, time). Use it for photos
   * of people. Cloudinary rotates uploads upright by their EXIF orientation by default, before stripping.
   */
  stripMetadata?: boolean;
};

/**
 * Uploads an image to Cloudinary.
 * @param file A data URI (`data:image/...;base64,...`), a remote URL, or a local file path.
 * @param folder Cloudinary folder, e.g. "mirror-ai/garments".
 */
export async function uploadImage(file: string, folder: string, options: UploadOptions = {}): Promise<UploadedImage> {
  if (!file.trim()) {
    throw new ImageUploadError("Please choose an image to upload.");
  }
  configure();

  let result: UploadApiResponse;
  try {
    result = await cloudinary.uploader.upload(file, {
      folder,
      resource_type: "image",
      // An incoming transformation is applied BEFORE storing, so the original with metadata is never kept.
      ...(options.stripMetadata ? { transformation: [{ flags: "force_strip" }] } : {}),
    });
  } catch (error) {
    console.error("[cloudinary] Upload failed:", error);
    throw new ImageUploadError("We couldn't upload your image. Please try again.", { cause: error });
  }

  return {
    url: result.secure_url,
    publicId: result.public_id,
    width: result.width,
    height: result.height,
  };
}

/**
 * Deletes an image, and clears it from Cloudinary's CDN cache so its URL stops working.
 * Never throws: returns false (and logs) when it couldn't delete, so callers that are already
 * handling another error can clean up best-effort. "not found" counts as deleted: it's gone.
 */
export async function deleteImage(publicId: string): Promise<boolean> {
  if (!publicId.trim()) return false;
  try {
    configure();
    const response: unknown = await cloudinary.uploader.destroy(publicId, {
      resource_type: "image",
      invalidate: true,
    });
    const result = typeof response === "object" && response !== null && "result" in response ? response.result : null;
    if (result === "ok" || result === "not found") return true;
    console.error(`[cloudinary] Delete of ${publicId} returned:`, response);
    return false;
  } catch (error) {
    console.error(`[cloudinary] Delete of ${publicId} failed:`, error);
    return false;
  }
}

/**
 * The public id inside a Cloudinary image URL as uploadImage stores it
 * (https://res.cloudinary.com/<cloud>/image/upload/[v123/]<publicId>.<ext>), or null if it isn't one.
 * Rows keep only the URL; deleteImage needs the public id.
 */
export function publicIdFromUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" || parsed.hostname !== "res.cloudinary.com") return null;
  const match = parsed.pathname.match(/^\/[^/]+\/image\/upload\/(?:v\d+\/)?(.+)\.[a-z0-9]+$/i);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null; // a malformed %-escape
  }
}

/**
 * The same Cloudinary image, but served as a download (`fl_attachment`), because browsers ignore
 * <a download> for images on another site. Null if `url` isn't a Cloudinary upload URL.
 */
export function downloadUrl(url: string): string | null {
  if (!publicIdFromUrl(url)) return null;
  return url.replace("/image/upload/", "/image/upload/fl_attachment/");
}
