import { Client, handle_file } from "@gradio/client";
import type { Category } from "@prisma/client";

// Server-only: uses HF_TOKEN. The ONLY file that talks to the try-on model (code rules),
// so switching providers (e.g. to self-hosted CatVTON) changes this file alone.
// Model decision and API contract: docs/project-plan.md, "Try-on model".

export const SPACE_ID = "levihsu/OOTDiffusion";
export const ENDPOINT = "/process_dc";
export const DEFAULT_TIMEOUT_MS = 120_000;

/** Our category → OOTDiffusion's `category` dropdown value. */
export const CATEGORY_TO_OOTD = {
  UPPER: "Upper-body",
  LOWER: "Lower-body",
  OVERALL: "Dress",
} as const satisfies Record<Category, string>;

export type TryOnErrorCode = "BAD_INPUT" | "UNAVAILABLE" | "QUOTA" | "TIMEOUT" | "NO_RESULT" | "FAILED";

/** Any try-on problem. `message` is safe to show users; details are logged on the server. */
export class TryOnError extends Error {
  constructor(
    public readonly code: TryOnErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "TryOnError";
  }
}

export type TryOnInput = {
  /** Public https URL of the person photo (Cloudinary). */
  personImageUrl: string;
  /** Public https URL of the garment image (Cloudinary). */
  garmentImageUrl: string;
  category: Category;
  timeoutMs?: number;
};

export type TryOnResult = {
  /** Temporary URL on the Space; the caller should copy it to Cloudinary. */
  resultImageUrl: string;
};

function assertHttpsUrl(value: string, what: string): void {
  let url: URL | undefined;
  try {
    url = new URL(value);
  } catch {
    url = undefined;
  }
  if (!url || url.protocol !== "https:") {
    throw new TryOnError("BAD_INPUT", `Please provide a valid ${what} image.`);
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout: () => void): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      onTimeout();
      reject(new TryOnError("TIMEOUT", "The try-on took too long. Please try again."));
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** Picks the first image URL from the Gallery output (items may also be videos). */
function firstImageUrl(data: unknown): string | undefined {
  const gallery = Array.isArray(data) ? data[0] : undefined;
  if (!Array.isArray(gallery)) return undefined;
  for (const item of gallery) {
    const url = (item as { image?: { url?: unknown } } | null)?.image?.url;
    if (typeof url === "string" && url.length > 0) return url;
  }
  return undefined;
}

function toTryOnError(error: unknown): TryOnError {
  if (error instanceof TryOnError) return error;
  const text = error instanceof Error ? error.message : String(error);
  if (/quota/i.test(text)) {
    return new TryOnError("QUOTA", "Try-on is busy right now. Please try again later.", { cause: error });
  }
  return new TryOnError("FAILED", "We couldn't create your try-on. Please try again.", { cause: error });
}

/** Connects to the Space and runs one prediction. Returns the raw `data` output. */
async function callSpace(
  input: TryOnInput,
  category: (typeof CATEGORY_TO_OOTD)[Category],
  token: `hf_${string}`,
  state: { timedOut: boolean },
): Promise<unknown> {
  let app: Client;
  try {
    app = await Client.connect(SPACE_ID, { token });
  } catch (error) {
    console.error("[tryon] Could not connect to the Space:", error);
    throw new TryOnError("UNAVAILABLE", "Try-on isn't available right now. Please try again later.", {
      cause: error,
    });
  }
  // The caller already gave up: don't start a prediction nobody will read (it would still use GPU quota).
  if (state.timedOut) {
    throw new TryOnError("TIMEOUT", "The try-on took too long. Please try again.");
  }
  const result = await app.predict(ENDPOINT, {
    vton_img: handle_file(input.personImageUrl),
    garm_img: handle_file(input.garmentImageUrl),
    category,
    n_samples: 1,
    n_steps: 20,
    image_scale: 2.0,
    seed: -1,
  });
  return result.data;
}

/** Runs one virtual try-on on the OOTDiffusion Space. Always passes BOTH images (the Space has sample defaults). */
export async function runTryOn(input: TryOnInput): Promise<TryOnResult> {
  assertHttpsUrl(input.personImageUrl, "person");
  assertHttpsUrl(input.garmentImageUrl, "garment");
  // Object.hasOwn: a plain lookup would accept inherited keys like "toString" at runtime.
  if (!Object.hasOwn(CATEGORY_TO_OOTD, input.category)) {
    throw new TryOnError("BAD_INPUT", "This product can't be tried on.");
  }
  const category = CATEGORY_TO_OOTD[input.category];

  const token = process.env.HF_TOKEN;
  if (!token || !token.startsWith("hf_")) {
    console.error("[tryon] HF_TOKEN is missing or malformed");
    throw new TryOnError("UNAVAILABLE", "Try-on isn't available right now. Please try again later.");
  }

  let data: unknown;
  try {
    // One deadline for connecting AND predicting: a sleeping Space can make connect hang too.
    const state = { timedOut: false };
    data = await withTimeout(
      callSpace(input, category, token as `hf_${string}`, state),
      input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      () => {
        state.timedOut = true;
      },
    );
  } catch (error) {
    const tryOnError = toTryOnError(error);
    if (tryOnError.code !== "UNAVAILABLE") {
      console.error(`[tryon] Prediction failed (${tryOnError.code}):`, error);
    }
    throw tryOnError;
  }

  const resultImageUrl = firstImageUrl(data);
  if (!resultImageUrl) {
    console.error("[tryon] No image in the Space output:", JSON.stringify(data)?.slice(0, 500));
    throw new TryOnError("NO_RESULT", "We couldn't create your try-on. Please try again.");
  }
  return { resultImageUrl };
}
