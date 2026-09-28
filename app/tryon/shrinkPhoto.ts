// Browser-only: shrinks a chosen photo before upload. Phone photos are often over the 5 MB limit
// (app/tryon/actions.ts), and the model works at about 768×1024 anyway. Re-drawing the image on a canvas
// also drops its EXIF data (GPS etc.) before it ever leaves the phone; the server strips it again anyway.

export const MAX_SIDE = 1600;
const JPEG_QUALITY = 0.9;

/** The size that fits within `max`×`max`, keeping the aspect ratio. Never scales up. */
export function fitWithin(width: number, height: number, max = MAX_SIDE): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Returns a JPEG copy of `file`, at most MAX_SIDE on its longest side. Throws if the browser can't read it. */
export async function shrinkPhoto(file: File): Promise<File> {
  // "from-image" applies the EXIF orientation, so phone photos aren't sideways after the redraw.
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser can't draw images.");
    context.fillStyle = "#ffffff"; // JPEG has no transparency: without this, a transparent PNG turns black
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
    if (!blob) throw new Error("This browser couldn't encode the photo.");
    return new File([blob], "photo.jpg", { type: "image/jpeg" });
  } finally {
    bitmap.close();
  }
}
