// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Everything outside the action is mocked: auth, Cloudinary, the database, and Inngest.
const m = vi.hoisted(() => ({
  requireUser: vi.fn(),
  isAdmin: vi.fn(),
  uploadImage: vi.fn(),
  deleteImage: vi.fn(),
  getProduct: vi.fn(),
  createTryOn: vi.fn(),
  failTryOn: vi.fn(),
  deleteTryOns: vi.fn(),
  nextTryOnAllowedAt: vi.fn(),
  isOverTryOnLimit: vi.fn(),
  send: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ requireUser: m.requireUser, isAdmin: m.isAdmin }));
vi.mock("@/lib/cloudinary", async () => {
  const actual = await vi.importActual<typeof import("@/lib/cloudinary")>("@/lib/cloudinary");
  return { ImageUploadError: actual.ImageUploadError, uploadImage: m.uploadImage, deleteImage: m.deleteImage };
});
vi.mock("@/lib/inngest", async () => {
  const actual = await vi.importActual<typeof import("@/lib/inngest")>("@/lib/inngest");
  return { tryOnRequested: actual.tryOnRequested, inngest: { send: m.send } }; // the real event, a fake send
});
vi.mock("@/lib/products", async () => {
  const actual = await vi.importActual<typeof import("@/lib/products")>("@/lib/products");
  return { ProductError: actual.ProductError, getProduct: m.getProduct };
});
vi.mock("@/lib/tryons", async () => {
  const actual = await vi.importActual<typeof import("@/lib/tryons")>("@/lib/tryons");
  return {
    TRYON_LIMIT: actual.TRYON_LIMIT,
    TryOnRecordError: actual.TryOnRecordError,
    createTryOn: m.createTryOn,
    failTryOn: m.failTryOn,
    deleteTryOns: m.deleteTryOns,
    nextTryOnAllowedAt: m.nextTryOnAllowedAt,
    isOverTryOnLimit: m.isOverTryOnLimit,
  };
});

import { ImageUploadError } from "@/lib/cloudinary";
import { ProductError } from "@/lib/products";
import { TryOnRecordError } from "@/lib/tryons";
import { createTryOnAction } from "./actions";

const USER = "user_123";
const PRODUCT_ID = "65f0c0ffee0000000000beef";
const TRYON_ID = "65f0c0ffee0000000000abcd";
const UPLOADED = {
  url: "https://res.cloudinary.com/demo/image/upload/mirror-ai/people/me.jpg",
  publicId: "mirror-ai/people/me",
  width: 768,
  height: 1024,
};
const EMPTY = { error: null, tryOnId: null };
const START_FAILED = { error: "We couldn't start your try-on. Please try again.", tryOnId: null };

// Real file signatures ("magic bytes"): the action checks these, not the type the client claims.
const JPEG = [0xff, 0xd8, 0xff, 0xe0];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const WEBP = [...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WEBP")];
const SVG = [...Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')];
const PDF = [...Buffer.from("%PDF-1.7")];

/** A file that starts with `header` and is padded with zeros to `size` bytes. */
function photo(header = JPEG, type = "image/jpeg", size = header.length): File {
  const bytes = new Uint8Array(size);
  bytes.set(header.slice(0, size));
  return new File([bytes], "me.jpg", { type });
}

function form(overrides: Record<string, string | File | null> = {}): FormData {
  const values: Record<string, string | File | null> = { productId: PRODUCT_ID, photo: photo(), ...overrides };
  const fd = new FormData();
  for (const [key, value] of Object.entries(values)) if (value !== null) fd.append(key, value);
  return fd;
}

describe("createTryOnAction", () => {
  beforeEach(() => {
    m.requireUser.mockResolvedValue(USER);
    m.getProduct.mockResolvedValue({ id: PRODUCT_ID, isActive: true });
    m.uploadImage.mockResolvedValue(UPLOADED);
    m.deleteImage.mockResolvedValue(true);
    m.createTryOn.mockResolvedValue({ id: TRYON_ID, status: "PENDING" });
    m.failTryOn.mockResolvedValue(true);
    m.deleteTryOns.mockResolvedValue(1);
    m.nextTryOnAllowedAt.mockResolvedValue(null); // under the limit
    m.isOverTryOnLimit.mockResolvedValue(false);
    m.isAdmin.mockResolvedValue(false);
    m.send.mockResolvedValue({ ids: ["evt_1"] });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("uploads the photo, saves a PENDING try-on, sends the job event, and returns only the id", async () => {
    await expect(createTryOnAction(EMPTY, form())).resolves.toEqual({ error: null, tryOnId: TRYON_ID });

    expect(m.getProduct).toHaveBeenCalledWith(PRODUCT_ID);
    expect(m.uploadImage).toHaveBeenCalledWith(
      `data:image/jpeg;base64,${Buffer.from(JPEG).toString("base64")}`,
      "mirror-ai/people",
      { stripMetadata: true }, // no EXIF/GPS in a photo that can be shared by link
    );
    expect(m.createTryOn).toHaveBeenCalledWith({ userId: USER, productId: PRODUCT_ID, personUrl: UPLOADED.url });
    expect(m.send).toHaveBeenCalledWith(
      expect.objectContaining({ name: "tryon/requested", data: { tryOnId: TRYON_ID } }),
    );
    expect(m.deleteImage).not.toHaveBeenCalled();
    expect(m.failTryOn).not.toHaveBeenCalled();
  });

  it("takes the user id from the session, never from the form", async () => {
    await createTryOnAction(EMPTY, form({ userId: "user_attacker" }));
    expect(m.createTryOn).toHaveBeenCalledWith(expect.objectContaining({ userId: USER }));
  });

  it("checks sign-in before anything else", async () => {
    m.requireUser.mockRejectedValue(new Error("NEXT_REDIRECT:/sign-in"));
    await expect(createTryOnAction(EMPTY, form())).rejects.toThrow("NEXT_REDIRECT:/sign-in");
    expect(m.getProduct).not.toHaveBeenCalled();
    expect(m.uploadImage).not.toHaveBeenCalled();
  });

  describe("rejects bad input before touching the database or Cloudinary", () => {
    it.each([
      ["no photo", { photo: null }, "Please add a photo of yourself."],
      ["an empty photo", { photo: photo(JPEG, "image/jpeg", 0) }, "Please add a photo of yourself."],
      ["a photo sent as text", { photo: "me.jpg" }, "Please add a photo of yourself."],
      ["an SVG", { photo: photo(SVG, "image/svg+xml") }, "The photo must be a JPEG, PNG or WebP image."],
      ["an SVG claiming to be a JPEG", { photo: photo(SVG, "image/jpeg") }, "The photo must be a JPEG, PNG or WebP image."],
      ["a PDF claiming to be a PNG", { photo: photo(PDF, "image/png") }, "The photo must be a JPEG, PNG or WebP image."],
      ["a photo over 5 MB", { photo: photo(PNG, "image/png", 5 * 1024 * 1024 + 1) }, "The photo must be 5 MB or smaller."],
      ["no product", { productId: null }, "Please choose a garment to try on."],
      ["a malformed product id", { productId: "../admin" }, "Please choose a garment to try on."],
    ])("%s", async (_case, override, message) => {
      await expect(createTryOnAction(EMPTY, form(override))).resolves.toEqual({ error: message, tryOnId: null });
      expect(m.getProduct).not.toHaveBeenCalled();
      expect(m.uploadImage).not.toHaveBeenCalled();
      expect(m.createTryOn).not.toHaveBeenCalled();
    });
  });

  it("accepts a WebP photo of exactly 5 MB", async () => {
    const result = await createTryOnAction(EMPTY, form({ photo: photo(WEBP, "image/webp", 5 * 1024 * 1024) }));
    expect(result).toEqual({ error: null, tryOnId: TRYON_ID });
    expect(m.uploadImage).toHaveBeenCalledWith(expect.stringMatching(/^data:image\/webp;base64,/), "mirror-ai/people", {
      stripMetadata: true,
    });
  });

  it("labels the upload with the real format, not the one the client claims", async () => {
    await createTryOnAction(EMPTY, form({ photo: photo(PNG, "image/jpeg") }));
    expect(m.uploadImage).toHaveBeenCalledWith(expect.stringMatching(/^data:image\/png;base64,/), "mirror-ai/people", {
      stripMetadata: true,
    });
  });

  it.each([
    ["an unknown", null],
    ["a hidden", { id: PRODUCT_ID, isActive: false }],
  ])("refuses %s product without uploading the photo", async (_case, product) => {
    m.getProduct.mockResolvedValue(product);
    await expect(createTryOnAction(EMPTY, form())).resolves.toEqual({
      error: "That garment isn't available any more.",
      tryOnId: null,
    });
    expect(m.uploadImage).not.toHaveBeenCalled();
  });

  it("shows a friendly message when loading the product fails", async () => {
    m.getProduct.mockRejectedValue(new ProductError("DB_ERROR", "Something went wrong with the products."));
    const result = await createTryOnAction(EMPTY, form());
    expect(result).toEqual({ error: "Something went wrong with the products.", tryOnId: null });
    expect(m.uploadImage).not.toHaveBeenCalled();
  });

  it("shows the upload's friendly message when Cloudinary fails, and saves nothing", async () => {
    m.uploadImage.mockRejectedValue(new ImageUploadError("We couldn't upload your image. Please try again."));
    const result = await createTryOnAction(EMPTY, form());
    expect(result).toEqual({ error: "We couldn't upload your image. Please try again.", tryOnId: null });
    expect(m.createTryOn).not.toHaveBeenCalled();
    expect(m.send).not.toHaveBeenCalled();
  });

  it("deletes the uploaded photo when saving the try-on fails, so it can't outlive the 24 h promise", async () => {
    m.createTryOn.mockRejectedValue(new TryOnRecordError("DB_ERROR", "Something went wrong saving your try-on."));
    const result = await createTryOnAction(EMPTY, form());
    expect(result).toEqual({ error: "Something went wrong saving your try-on.", tryOnId: null });
    expect(m.deleteImage).toHaveBeenCalledWith(UPLOADED.publicId);
    expect(m.send).not.toHaveBeenCalled();
  });

  it("marks the try-on FAILED and shows a friendly message when the job event can't be sent", async () => {
    const inngestError = new Error("401 Event key not found");
    m.send.mockRejectedValue(inngestError);
    await expect(createTryOnAction(EMPTY, form())).resolves.toEqual(START_FAILED);
    expect(m.failTryOn).toHaveBeenCalledWith(TRYON_ID, START_FAILED.error, ["PENDING"]); // never overwrites the job's status
    expect(m.deleteImage).not.toHaveBeenCalled(); // the row still exists, so the cleanup job will delete the photo
    expect(console.error).toHaveBeenCalledWith("[tryon] Sending the try-on event failed:", inngestError);
  });

  it("still shows the friendly message if marking the try-on FAILED also fails", async () => {
    m.send.mockRejectedValue(new Error("network down"));
    const dbError = new TryOnRecordError("DB_ERROR", "db down");
    m.failTryOn.mockRejectedValue(dbError);
    await expect(createTryOnAction(EMPTY, form())).resolves.toEqual(START_FAILED);
    expect(console.error).toHaveBeenCalledWith("[tryon] Marking the try-on FAILED also failed:", dbError);
  });

  describe("the try-on limit (task 52: 3 per hour; failed ones don't count, admins have none)", () => {
    const inMinutes = (minutes: number) => new Date(Date.now() + minutes * 60_000);
    const full = (when: string) => ({ error: `You've used your 3 try-ons for this hour. ${when}`, tryOnId: null });

    it("under the limit, starts the try-on without asking Clerk whether the user is an admin", async () => {
      await expect(createTryOnAction(EMPTY, form())).resolves.toEqual({ error: null, tryOnId: TRYON_ID });
      expect(m.nextTryOnAllowedAt).toHaveBeenCalledWith(USER);
      expect(m.isOverTryOnLimit).toHaveBeenCalledWith(USER);
      expect(m.isAdmin).not.toHaveBeenCalled();
    });

    it("at the limit, refuses before uploading anything and says when to try again", async () => {
      m.nextTryOnAllowedAt.mockResolvedValue(inMinutes(12));
      await expect(createTryOnAction(EMPTY, form())).resolves.toEqual(full("You can start another in 12 minutes."));
      expect(m.uploadImage).not.toHaveBeenCalled();
      expect(m.getProduct).not.toHaveBeenCalled();
      expect(m.createTryOn).not.toHaveBeenCalled();
    });

    it("says '1 minute' (not '0 minutes') when the wait is under a minute", async () => {
      m.nextTryOnAllowedAt.mockResolvedValue(inMinutes(0.2));
      await expect(createTryOnAction(EMPTY, form())).resolves.toEqual(full("You can start another in 1 minute."));
    });

    it("lets an admin past both checks, asking Clerk only once", async () => {
      m.nextTryOnAllowedAt.mockResolvedValue(inMinutes(30));
      m.isOverTryOnLimit.mockResolvedValue(true);
      m.isAdmin.mockResolvedValue(true);
      await expect(createTryOnAction(EMPTY, form())).resolves.toEqual({ error: null, tryOnId: TRYON_ID });
      expect(m.send).toHaveBeenCalled();
      expect(m.deleteTryOns).not.toHaveBeenCalled();
      expect(m.isAdmin).toHaveBeenCalledTimes(1);
    });

    it("undoes a try-on that went over in a race (photo first, then row) and never starts it", async () => {
      m.isOverTryOnLimit.mockResolvedValue(true);
      await expect(createTryOnAction(EMPTY, form())).resolves.toEqual({
        error: "Too many try-ons started at once. Please try again in a moment.",
        tryOnId: null,
      });
      expect(m.deleteImage).toHaveBeenCalledWith(UPLOADED.publicId);
      expect(m.deleteTryOns).toHaveBeenCalledWith([TRYON_ID]);
      expect(m.deleteImage.mock.invocationCallOrder[0]).toBeLessThan(m.deleteTryOns.mock.invocationCallOrder[0]);
      expect(m.failTryOn).not.toHaveBeenCalled();
      expect(m.send).not.toHaveBeenCalled();
    });

    it("if the re-check fails, undoes the try-on and shows a friendly message", async () => {
      m.isOverTryOnLimit.mockRejectedValue(new TryOnRecordError("DB_ERROR", "Something went wrong saving your try-on."));
      await expect(createTryOnAction(EMPTY, form())).resolves.toEqual({
        error: "Something went wrong saving your try-on.",
        tryOnId: null,
      });
      expect(m.deleteImage).toHaveBeenCalledWith(UPLOADED.publicId);
      expect(m.deleteTryOns).toHaveBeenCalledWith([TRYON_ID]);
      expect(m.send).not.toHaveBeenCalled();
    });

    it("if Clerk fails in the first check (over the limit), shows the generic message and uploads nothing", async () => {
      const clerkError = new Error("Clerk: 503");
      m.nextTryOnAllowedAt.mockResolvedValue(inMinutes(10));
      m.isAdmin.mockRejectedValue(clerkError);
      await expect(createTryOnAction(EMPTY, form())).resolves.toEqual({
        error: "Something went wrong. Please try again.",
        tryOnId: null,
      });
      expect(m.uploadImage).not.toHaveBeenCalled();
      expect(console.error).toHaveBeenCalledWith("[tryon] Unexpected error:", clerkError);
    });

    it("if Clerk fails in the re-check, undoes the try-on, shows the generic message, and never starts it", async () => {
      m.isOverTryOnLimit.mockResolvedValue(true);
      m.isAdmin.mockRejectedValue(new Error("Clerk: 503"));
      await expect(createTryOnAction(EMPTY, form())).resolves.toEqual({
        error: "Something went wrong. Please try again.",
        tryOnId: null,
      });
      expect(m.deleteImage).toHaveBeenCalledWith(UPLOADED.publicId);
      expect(m.deleteTryOns).toHaveBeenCalledWith([TRYON_ID]);
      expect(m.send).not.toHaveBeenCalled();
    });

    it("marks the row FAILED when deleting it fails, so it isn't stuck 'Waiting to start' or counted", async () => {
      const dbError = new TryOnRecordError("DB_ERROR", "db down");
      m.isOverTryOnLimit.mockResolvedValue(true);
      m.deleteTryOns.mockRejectedValue(dbError);
      await expect(createTryOnAction(EMPTY, form())).resolves.toMatchObject({ tryOnId: null });
      expect(console.error).toHaveBeenCalledWith("[tryon] Deleting a try-on that never started failed:", dbError);
      expect(m.failTryOn).toHaveBeenCalledWith(TRYON_ID, START_FAILED.error, ["PENDING"]);
    });

    it("logs both when deleting the row and marking it FAILED fail", async () => {
      const failError = new TryOnRecordError("DB_ERROR", "still down");
      m.isOverTryOnLimit.mockResolvedValue(true);
      m.deleteTryOns.mockRejectedValue(new TryOnRecordError("DB_ERROR", "db down"));
      m.failTryOn.mockRejectedValue(failError);
      await expect(createTryOnAction(EMPTY, form())).resolves.toMatchObject({ tryOnId: null });
      expect(console.error).toHaveBeenCalledWith("[tryon] Marking it FAILED instead also failed:", failError);
    });

    it("shows a friendly message and uploads nothing when the first check fails", async () => {
      m.nextTryOnAllowedAt.mockRejectedValue(new TryOnRecordError("DB_ERROR", "Something went wrong saving your try-on."));
      await expect(createTryOnAction(EMPTY, form())).resolves.toEqual({
        error: "Something went wrong saving your try-on.",
        tryOnId: null,
      });
      expect(m.uploadImage).not.toHaveBeenCalled();
    });
  });

  it("hides unexpected errors behind a generic message and logs them", async () => {
    const bug = new TypeError("Cannot read properties of undefined");
    m.createTryOn.mockRejectedValue(bug);
    const result = await createTryOnAction(EMPTY, form());
    expect(result).toEqual({ error: "Something went wrong. Please try again.", tryOnId: null });
    expect(console.error).toHaveBeenCalledWith("[tryon] Unexpected error:", bug);
    expect(m.deleteImage).toHaveBeenCalledWith(UPLOADED.publicId);
  });
});
