import { afterEach, describe, expect, it, vi } from "vitest";
import { FALLBACK_COLOR, borderColor, dominantColor, garmentMask, loadGarmentLook, printPixels, toHex } from "./garmentLook";

type Rgba = [number, number, number, number];
const WHITE: Rgba = [255, 255, 255, 255];
const BLUE: Rgba = [30, 60, 200, 255];

/** A width×height image from a function of (x, y), as RGBA bytes. */
function image(width: number, height: number, pixel: (x: number, y: number) => Rgba): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data.set(pixel(x, y), (y * width + x) * 4);
  return data;
}

// 7×7: white background, a blue 5×5 block inside it, with a white "logo" pixel in the middle of the block.
const SHIRT = image(7, 7, (x, y) => {
  if (x === 3 && y === 3) return WHITE; // the logo
  return x >= 1 && x <= 5 && y >= 1 && y <= 5 ? BLUE : WHITE;
});

describe("the garment's look from its photo", () => {
  it("takes the background color from the image's border", () => {
    expect(borderColor(SHIRT, 7, 7)).toEqual({ r: 255, g: 255, b: 255 });
  });

  it("marks the garment, but not the background around it, and keeps a white logo INSIDE the garment", () => {
    const mask = garmentMask(SHIRT, 7, 7);
    expect(mask[0]).toBe(0); // a background corner
    expect(mask[1 * 7 + 1]).toBe(1); // the block
    expect(mask[3 * 7 + 3]).toBe(1); // the logo: white, but not connected to the border
    expect(Array.from(mask).filter(Boolean)).toHaveLength(25);
  });

  it("has no background color when the whole border is transparent (a cut-out PNG), instead of black", () => {
    const png = image(5, 5, (x, y) => (x >= 1 && x <= 3 && y >= 1 && y <= 3 ? BLUE : [0, 0, 0, 0]));
    expect(borderColor(png, 5, 5)).toBeNull();
  });

  it.each([
    ["white", [255, 255, 255, 255], "#ffffff"],
    ["cream", [240, 235, 225, 255], "#f0ebe1"],
    ["light grey", [220, 220, 220, 255], "#dcdcdc"],
    ["black", [10, 10, 10, 255], "#0a0a0a"],
  ] as const)("keeps a %s garment cut out on a transparent PNG, with its real color", (_case, garment, hex) => {
    const png = image(5, 5, (x, y) => (x >= 1 && x <= 3 && y >= 1 && y <= 3 ? [...garment] : [0, 0, 0, 0]));
    const mask = garmentMask(png, 5, 5);
    expect(Array.from(mask).filter(Boolean)).toHaveLength(9); // only transparency is background
    expect(toHex(dominantColor(png, mask))).toBe(hex);
  });

  it("keeps a cut-out garment that touches the image's edges (its own pixels aren't taken for background)", () => {
    // Trousers reaching the bottom edge: the only opaque border pixels are the garment's.
    const trousers = image(5, 5, (x, y) => (x >= 1 && x <= 3 && y >= 1 ? BLUE : [0, 0, 0, 0]));
    expect(borderColor(trousers, 5, 5)).toBeNull(); // most of the border is transparent: a cut-out
    expect(Array.from(garmentMask(trousers, 5, 5)).filter(Boolean)).toHaveLength(12);
    // A tee filling the width, with a white logo: all of it kept, so its color is the tee's blue, not the logo's white.
    const tee = image(7, 7, (x, y) => (y === 0 || y === 6 ? [0, 0, 0, 0] : x === 3 && y === 3 ? WHITE : BLUE));
    const mask = garmentMask(tee, 7, 7);
    expect(Array.from(mask).filter(Boolean)).toHaveLength(35);
    expect(dominantColor(tee, mask).b).toBeCloseTo((34 * 200 + 255) / 35);
  });

  it("still uses an opaque border's color when only a little of it is transparent", () => {
    const mostlyWhite = image(5, 5, (x, y) => (x === 0 && y === 0 ? [0, 0, 0, 0] : x >= 1 && x <= 3 && y >= 1 && y <= 3 ? BLUE : WHITE));
    expect(borderColor(mostlyWhite, 5, 5)).toEqual({ r: 255, g: 255, b: 255 });
    expect(Array.from(garmentMask(mostlyWhite, 5, 5)).filter(Boolean)).toHaveLength(9);
  });

  it("uses the whole image's real color in the fallback (a blue garment on a blue background stays blue)", () => {
    const blueOnBlue = image(4, 4, () => BLUE);
    const mask = garmentMask(blueOnBlue, 4, 4);
    expect(Array.from(mask).filter(Boolean)).toHaveLength(0); // nothing stands out
    expect(toHex(dominantColor(blueOnBlue, mask))).toBe("#1e3cc8");
  });

  it("leaves transparent pixels out of the whole-image fallback color", () => {
    const png = image(3, 3, (x, y) => (x === 1 && y === 1 ? WHITE : [0, 0, 0, 0]));
    expect(dominantColor(png, new Uint8Array(9))).toEqual({ r: 255, g: 255, b: 255 }); // not darkened by "black" transparency
  });

  it("treats transparent pixels as background", () => {
    const transparent = image(3, 3, (x, y) => (x === 1 && y === 1 ? BLUE : [0, 0, 0, 0]));
    expect(Array.from(garmentMask(transparent, 3, 3))).toEqual([0, 0, 0, 0, 1, 0, 0, 0, 0]);
  });

  it("averages the garment's pixels for its color (the logo is a small part)", () => {
    const color = dominantColor(SHIRT, garmentMask(SHIRT, 7, 7));
    expect(color.r).toBeCloseTo((24 * 30 + 255) / 25);
    expect(color.b).toBeCloseTo((24 * 200 + 255) / 25);
  });

  it("falls back to the whole image's color when nothing stands out (a white shirt on white)", () => {
    const white = image(4, 4, () => WHITE);
    expect(dominantColor(white, garmentMask(white, 4, 4))).toEqual({ r: 255, g: 255, b: 255 });
  });

  it("writes colors as #rrggbb, rounded and clamped", () => {
    expect(toHex({ r: 30, g: 60.4, b: 200 })).toBe("#1e3cc8");
    expect(toHex({ r: -3, g: 300, b: 0 })).toBe("#00ff00");
  });

  it("makes the print: the garment's pixels, the background in the garment's color, all opaque", () => {
    const mask = garmentMask(SHIRT, 7, 7);
    const print = printPixels(SHIRT, mask, { r: 10, g: 20, b: 30 });
    expect(Array.from(print.slice(0, 4))).toEqual([10, 20, 30, 255]); // background → garment color
    const block = (1 * 7 + 1) * 4;
    expect(Array.from(print.slice(block, block + 4))).toEqual(BLUE); // garment kept
  });
});

describe("loadGarmentLook", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    Reflect.deleteProperty(HTMLImageElement.prototype, "decode");
  });

  it("reads the photo (shrunk to 512 px) into its color and print canvas", async () => {
    // Fake the browser parts jsdom lacks: decoding, natural size, and a 2D canvas holding our 7×7 shirt.
    Object.defineProperty(HTMLImageElement.prototype, "decode", { value: () => Promise.resolve(), configurable: true });
    vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(7);
    vi.spyOn(HTMLImageElement.prototype, "naturalHeight", "get").mockReturnValue(7);
    class FakeImageData {
      constructor(readonly data: Uint8ClampedArray, readonly width: number, readonly height: number) {}
    }
    vi.stubGlobal("ImageData", FakeImageData);
    const context = { drawImage: vi.fn(), getImageData: vi.fn(() => ({ data: SHIRT })), putImageData: vi.fn() };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as unknown as CanvasRenderingContext2D);

    const look = await loadGarmentLook("https://res.cloudinary.com/demo/image/upload/shirt.png");
    expect(look.color).toBe(toHex(dominantColor(SHIRT, garmentMask(SHIRT, 7, 7))));
    expect(look.print).toBeInstanceOf(HTMLCanvasElement);
    expect(look.print?.width).toBe(7);
    expect(context.drawImage).toHaveBeenCalledWith(expect.any(HTMLImageElement), 0, 0, 7, 7);
    const written = context.putImageData.mock.calls[0][0] as FakeImageData;
    expect(Array.from(written.data.slice(0, 4))).toEqual([...Object.values(dominantColor(SHIRT, garmentMask(SHIRT, 7, 7))).map(Math.round), 255]);
  });

  it("never throws: when the photo can't be read, uses a neutral grey with no print (and says why in the console)", async () => {
    // jsdom can't decode images or draw on a canvas, like a browser that blocks reading the photo.
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(loadGarmentLook("https://res.cloudinary.com/demo/image/upload/shirt.png")).resolves.toEqual({
      color: FALLBACK_COLOR,
      print: null,
    });
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("Couldn't read the garment photo"), expect.any(Error));
  });
});
