// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the Gradio client: unit tests never call the real Space or spend GPU quota.
const { connect, predict, handle_file } = vi.hoisted(() => ({
  connect: vi.fn(),
  predict: vi.fn(),
  handle_file: vi.fn((url: string) => ({ handled: url })),
}));
vi.mock("@gradio/client", () => ({ Client: { connect }, handle_file }));

import { CATEGORY_TO_OOTD, ENDPOINT, SPACE_ID, TryOnError, runTryOn } from "./tryon";

const PERSON = "https://res.cloudinary.com/demo/image/upload/person.jpg";
const GARMENT = "https://res.cloudinary.com/demo/image/upload/shirt.png";
const RESULT = "https://levihsu-ootdiffusion.hf.space/gradio_api/file=/tmp/result.png";

function gallery(...items: unknown[]) {
  return { data: [items] };
}

async function tryOnError(promise: Promise<unknown>): Promise<TryOnError> {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(TryOnError);
  return error as TryOnError;
}

describe("runTryOn", () => {
  beforeEach(() => {
    vi.stubEnv("HF_TOKEN", "hf_placeholdertoken");
    vi.spyOn(console, "error").mockImplementation(() => {});
    connect.mockResolvedValue({ predict });
    predict.mockResolvedValue(gallery({ image: { url: RESULT }, caption: null }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    connect.mockReset();
    predict.mockReset();
    handle_file.mockClear();
  });

  it("maps every category to OOTDiffusion's values", () => {
    expect(CATEGORY_TO_OOTD).toEqual({ UPPER: "Upper-body", LOWER: "Lower-body", OVERALL: "Dress" });
  });

  it.each([
    ["UPPER", "Upper-body"],
    ["LOWER", "Lower-body"],
    ["OVERALL", "Dress"],
  ] as const)("calls /process_dc with both images and category %s → %s", async (category, ootd) => {
    await expect(runTryOn({ personImageUrl: PERSON, garmentImageUrl: GARMENT, category })).resolves.toEqual({
      resultImageUrl: RESULT,
    });
    expect(connect).toHaveBeenCalledWith(SPACE_ID, { token: "hf_placeholdertoken" });
    expect(predict).toHaveBeenCalledWith(ENDPOINT, {
      vton_img: { handled: PERSON },
      garm_img: { handled: GARMENT },
      category: ootd,
      n_samples: 1,
      n_steps: 20,
      image_scale: 2.0,
      seed: -1,
    });
  });

  it("takes the first image from the gallery, skipping video items", async () => {
    predict.mockResolvedValue(gallery({ video: { url: "https://x/v.mp4" } }, { image: { url: RESULT } }));
    await expect(
      runTryOn({ personImageUrl: PERSON, garmentImageUrl: GARMENT, category: "UPPER" }),
    ).resolves.toEqual({ resultImageUrl: RESULT });
  });

  it.each([
    ["an empty person URL", "", GARMENT],
    ["a non-https person URL", "http://example.com/p.jpg", GARMENT],
    ["a garbage garment URL", PERSON, "not a url"],
    ["an empty garment URL", PERSON, ""],
  ])("rejects %s as BAD_INPUT without calling the Space", async (_label, person, garment) => {
    const error = await tryOnError(
      runTryOn({ personImageUrl: person, garmentImageUrl: garment, category: "UPPER" }),
    );
    expect(error.code).toBe("BAD_INPUT");
    expect(connect).not.toHaveBeenCalled();
  });

  it.each(["SHOES", "toString"])("rejects an unknown category (%s) as BAD_INPUT", async (category) => {
    const error = await tryOnError(
      runTryOn({ personImageUrl: PERSON, garmentImageUrl: GARMENT, category: category as "UPPER" }),
    );
    expect(error.code).toBe("BAD_INPUT");
    expect(connect).not.toHaveBeenCalled();
  });

  it("is UNAVAILABLE (and logs) when HF_TOKEN is malformed", async () => {
    vi.stubEnv("HF_TOKEN", "not-a-hf-token");
    const error = await tryOnError(runTryOn({ personImageUrl: PERSON, garmentImageUrl: GARMENT, category: "UPPER" }));
    expect(error.code).toBe("UNAVAILABLE");
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("HF_TOKEN"));
    expect(connect).not.toHaveBeenCalled();
  });

  it("is UNAVAILABLE (and logs) when HF_TOKEN is missing", async () => {
    vi.stubEnv("HF_TOKEN", "");
    const error = await tryOnError(runTryOn({ personImageUrl: PERSON, garmentImageUrl: GARMENT, category: "UPPER" }));
    expect(error.code).toBe("UNAVAILABLE");
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("HF_TOKEN"));
    expect(connect).not.toHaveBeenCalled();
  });

  it("is UNAVAILABLE when the Space can't be reached", async () => {
    connect.mockRejectedValue(new Error("Space is sleeping"));
    const error = await tryOnError(runTryOn({ personImageUrl: PERSON, garmentImageUrl: GARMENT, category: "UPPER" }));
    expect(error.code).toBe("UNAVAILABLE");
    expect(error.message).not.toContain("sleeping");
  });

  it("is QUOTA when ZeroGPU quota is exceeded", async () => {
    predict.mockRejectedValue(new Error("You have exceeded your GPU quota (60s left)."));
    const error = await tryOnError(runTryOn({ personImageUrl: PERSON, garmentImageUrl: GARMENT, category: "UPPER" }));
    expect(error.code).toBe("QUOTA");
    expect(error.message).toBe("Try-on is busy right now. Please try again later.");
  });

  it("is FAILED for other errors, hiding provider details but logging them", async () => {
    const providerError = new Error("CUDA out of memory at layer 42");
    predict.mockRejectedValue(providerError);
    const error = await tryOnError(runTryOn({ personImageUrl: PERSON, garmentImageUrl: GARMENT, category: "UPPER" }));
    expect(error.code).toBe("FAILED");
    expect(error.message).not.toContain("CUDA");
    expect(error.cause).toBe(providerError);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("FAILED"), providerError);
  });

  it("is TIMEOUT when connecting to a sleeping Space takes too long", async () => {
    connect.mockReturnValue(new Promise(() => {})); // never connects
    const error = await tryOnError(
      runTryOn({ personImageUrl: PERSON, garmentImageUrl: GARMENT, category: "UPPER", timeoutMs: 20 }),
    );
    expect(error.code).toBe("TIMEOUT");
  });

  it("does not start a prediction if connecting finishes after the timeout", async () => {
    connect.mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve({ predict }), 40)));
    const error = await tryOnError(
      runTryOn({ personImageUrl: PERSON, garmentImageUrl: GARMENT, category: "UPPER", timeoutMs: 10 }),
    );
    expect(error.code).toBe("TIMEOUT");
    await new Promise((resolve) => setTimeout(resolve, 60)); // let the late connect finish
    expect(predict).not.toHaveBeenCalled();
  });

  it("is TIMEOUT when the Space takes too long", async () => {
    predict.mockReturnValue(new Promise(() => {})); // never resolves
    const error = await tryOnError(
      runTryOn({ personImageUrl: PERSON, garmentImageUrl: GARMENT, category: "UPPER", timeoutMs: 20 }),
    );
    expect(error.code).toBe("TIMEOUT");
  });

  it.each([
    ["an empty gallery", gallery()],
    ["only videos", gallery({ video: { url: "https://x/v.mp4" } })],
    ["no data", { data: [] }],
  ])("is NO_RESULT for %s", async (_label, output) => {
    predict.mockResolvedValue(output);
    const error = await tryOnError(runTryOn({ personImageUrl: PERSON, garmentImageUrl: GARMENT, category: "UPPER" }));
    expect(error.code).toBe("NO_RESULT");
  });
});
