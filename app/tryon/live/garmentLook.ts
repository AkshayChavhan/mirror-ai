// Live 3D (task 65): the product photo → the garment's color and its print, for the 3D template.
// The pixel math is pure (unit-tested); loadGarmentLook() is the small browser-only part.

export type Rgb = { r: number; g: number; b: number };

/** How far (0–441, RGB distance) a pixel may be from the border's color and still count as background. */
export const BACKGROUND_TOLERANCE = 48;
/** Used when the photo can't be read (e.g. no canvas): a neutral grey. */
export const FALLBACK_COLOR = "#8a8a8a";

const colorDistance = (data: ArrayLike<number>, i: number, c: Rgb) =>
  Math.hypot(data[i] - c.r, data[i + 1] - c.g, data[i + 2] - c.b);

const isTransparent = (rgba: ArrayLike<number>, p: number) => rgba[p * 4 + 3] < 16;

/**
 * The average color of the image's outer border: a product photo's background (usually white or light).
 * Null for a cut-out PNG, where at least half the border is transparent: then there's no background color,
 * only transparency (and any opaque border pixels are the garment itself, touching the edge).
 */
export function borderColor(rgba: ArrayLike<number>, width: number, height: number): Rgb | null {
  let r = 0, g = 0, b = 0, opaque = 0, total = 0;
  const add = (x: number, y: number) => {
    const p = y * width + x;
    total += 1;
    if (isTransparent(rgba, p)) return; // a canvas reads transparent pixels back as black
    r += rgba[p * 4]; g += rgba[p * 4 + 1]; b += rgba[p * 4 + 2]; opaque += 1;
  };
  for (let x = 0; x < width; x++) { add(x, 0); add(x, height - 1); }
  for (let y = 1; y < height - 1; y++) { add(0, y); add(width - 1, y); }
  return opaque > 0 && opaque * 2 > total ? { r: r / opaque, g: g / opaque, b: b / opaque } : null;
}

/**
 * Which pixels are the garment (1) and which the background (0): a flood fill from the border over pixels
 * close to the border's color, so a white patch INSIDE the garment (a logo) isn't mistaken for background.
 * Transparent pixels always count as background; on a cut-out (a border at least half transparent), ONLY
 * they do, so a white garment cut out on a transparent PNG is kept, even where it touches the edges.
 */
export function garmentMask(rgba: ArrayLike<number>, width: number, height: number, tolerance = BACKGROUND_TOLERANCE): Uint8Array {
  const mask = new Uint8Array(width * height).fill(1);
  if (width === 0 || height === 0) return mask;
  const background = borderColor(rgba, width, height);
  const isBackground = (p: number) =>
    isTransparent(rgba, p) || (background !== null && colorDistance(rgba, p * 4, background) <= tolerance);
  const queue: number[] = [];
  const visit = (p: number) => {
    if (mask[p] === 1 && isBackground(p)) {
      mask[p] = 0;
      queue.push(p);
    }
  };
  for (let x = 0; x < width; x++) { visit(x); visit((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { visit(y * width); visit(y * width + width - 1); }
  while (queue.length > 0) {
    const p = queue.pop() as number;
    const x = p % width;
    if (x > 0) visit(p - 1);
    if (x < width - 1) visit(p + 1);
    if (p >= width) visit(p - width);
    if (p < width * (height - 1)) visit(p + width);
  }
  return mask;
}

/**
 * The garment's average color. With no garment pixels (e.g. a white shirt on white), the whole image's.
 * Transparent pixels never count (a canvas reads them back as black).
 */
export function dominantColor(rgba: ArrayLike<number>, mask: Uint8Array): Rgb {
  const sum = (only: boolean) => {
    let r = 0, g = 0, b = 0, n = 0;
    for (let p = 0; p < mask.length; p++) {
      if ((only && mask[p] === 0) || isTransparent(rgba, p)) continue;
      r += rgba[p * 4]; g += rgba[p * 4 + 1]; b += rgba[p * 4 + 2]; n += 1;
    }
    return n > 0 ? { r: r / n, g: g / n, b: b / n } : null;
  };
  return sum(true) ?? sum(false) ?? { r: 138, g: 138, b: 138 };
}

export function toHex({ r, g, b }: Rgb): string {
  const part = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0");
  return `#${part(r)}${part(g)}${part(b)}`;
}

/** The print: the garment's own pixels, with the background replaced by the garment color (fully opaque). */
export function printPixels(rgba: ArrayLike<number>, mask: Uint8Array, color: Rgb): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(mask.length * 4);
  for (let p = 0; p < mask.length; p++) {
    const keep = mask[p] === 1;
    out[p * 4] = keep ? rgba[p * 4] : color.r;
    out[p * 4 + 1] = keep ? rgba[p * 4 + 1] : color.g;
    out[p * 4 + 2] = keep ? rgba[p * 4 + 2] : color.b;
    out[p * 4 + 3] = 255;
  }
  return out;
}

export type GarmentLook = {
  /** The garment's color, e.g. "#1e3a8a". */
  color: string;
  /** The print as a canvas (for a three.js CanvasTexture), or null when the photo couldn't be read. */
  print: HTMLCanvasElement | null;
};

/**
 * Browser-only: loads the product photo (shrunk to at most `maxSide`) and works out its look. Never throws:
 * if the photo can't be loaded or read (e.g. no canvas, or the image host doesn't allow it), it returns a
 * neutral grey with no print, and the garment still shows.
 */
export async function loadGarmentLook(imageUrl: string, maxSide = 512): Promise<GarmentLook> {
  try {
    const image = new Image();
    image.crossOrigin = "anonymous"; // Cloudinary allows it; needed to read the pixels back
    image.src = imageUrl;
    await image.decode();
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser can't draw images.");
    context.drawImage(image, 0, 0, width, height);
    const { data } = context.getImageData(0, 0, width, height);
    const mask = garmentMask(data, width, height);
    const color = dominantColor(data, mask);
    context.putImageData(new ImageData(printPixels(data, mask, color), width, height), 0, 0);
    return { color: toHex(color), print: canvas };
  } catch (error) {
    console.warn("[live] Couldn't read the garment photo; using a plain color.", error);
    return { color: FALLBACK_COLOR, print: null };
  }
}
