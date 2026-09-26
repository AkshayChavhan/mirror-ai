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

/**
 * Uploads an image to Cloudinary.
 * @param file A data URI (`data:image/...;base64,...`), a remote URL, or a local file path.
 * @param folder Cloudinary folder, e.g. "mirror-ai/garments".
 */
export async function uploadImage(file: string, folder: string): Promise<UploadedImage> {
  if (!file.trim()) {
    throw new ImageUploadError("Please choose an image to upload.");
  }
  configure();

  let result: UploadApiResponse;
  try {
    result = await cloudinary.uploader.upload(file, { folder, resource_type: "image" });
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
