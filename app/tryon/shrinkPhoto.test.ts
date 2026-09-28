import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_SIDE, fitWithin, shrinkPhoto } from "./shrinkPhoto";

describe("fitWithin", () => {
  it.each([
    ["a large portrait photo", 3024, 4032, { width: 1200, height: 1600 }],
    ["a large landscape photo", 4000, 3000, { width: 1600, height: 1200 }],
    ["a square photo", 2000, 2000, { width: 1600, height: 1600 }],
    ["a small photo (never scaled up)", 800, 600, { width: 800, height: 600 }],
    ["exactly the limit", 1600, 900, { width: 1600, height: 900 }],
  ])("fits %s within %i px", (_case, width, height, expected) => {
    expect(fitWithin(width, height)).toEqual(expected);
  });

  it("uses a 1600 px limit", () => {
    expect(MAX_SIDE).toBe(1600);
  });
});

describe("shrinkPhoto", () => {
  // jsdom has no image decoding or real canvas, so those browser APIs are stubbed.
  const drawImage = vi.fn();
  const fillRect = vi.fn();
  const close = vi.fn();

  function stubBrowser(blob: Blob | null, context: unknown = { drawImage, fillRect, fillStyle: "" }) {
    vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 3024, height: 4032, close })));
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (callback) {
      callback(blob);
    });
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    drawImage.mockReset();
    fillRect.mockReset();
    close.mockReset();
  });

  it("redraws the photo upright at the fitted size and returns a JPEG file", async () => {
    stubBrowser(new Blob(["jpeg"], { type: "image/jpeg" }));
    const input = new File(["original"], "IMG_0001.HEIC.jpg", { type: "image/jpeg" });

    const output = await shrinkPhoto(input);

    expect(createImageBitmap).toHaveBeenCalledWith(input, { imageOrientation: "from-image" });
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1200, 1600);
    // A white background first, so transparent PNG areas don't turn black as JPEG.
    expect(fillRect).toHaveBeenCalledWith(0, 0, 1200, 1600);
    expect(fillRect.mock.invocationCallOrder[0]).toBeLessThan(drawImage.mock.invocationCallOrder[0]);
    expect(HTMLCanvasElement.prototype.toBlob).toHaveBeenCalledWith(expect.any(Function), "image/jpeg", 0.9);
    expect(output).toBeInstanceOf(File);
    expect(output.type).toBe("image/jpeg");
    expect(output.name).toBe("photo.jpg");
    expect(close).toHaveBeenCalled(); // frees the decoded image
  });

  it("throws (and still frees the image) when the browser can't encode it", async () => {
    stubBrowser(null);
    await expect(shrinkPhoto(new File(["x"], "a.jpg", { type: "image/jpeg" }))).rejects.toThrow("couldn't encode");
    expect(close).toHaveBeenCalled();
  });

  it("throws when the browser has no 2D canvas", async () => {
    stubBrowser(new Blob(["jpeg"]), null);
    await expect(shrinkPhoto(new File(["x"], "a.jpg", { type: "image/jpeg" }))).rejects.toThrow("can't draw");
  });

  it("throws when the file isn't an image the browser can read", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn(async () => Promise.reject(new DOMException("bad image"))));
    await expect(shrinkPhoto(new File(["%PDF"], "a.pdf", { type: "application/pdf" }))).rejects.toThrow();
  });
});
