import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  createTryOnAction: vi.fn(),
  shrinkPhoto: vi.fn(),
  useTryOnStatus: vi.fn(),
  navigate: vi.fn(),
}));
vi.mock("./actions", () => ({ createTryOnAction: m.createTryOnAction }));
vi.mock("./shrinkPhoto", () => ({ shrinkPhoto: m.shrinkPhoto }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: m.navigate }) }));
// The polling itself is tested in useTryOnStatus.test.ts; here each test says what it reports.
vi.mock("./useTryOnStatus", () => ({ useTryOnStatus: m.useTryOnStatus }));
type Progress = import("./useTryOnStatus").TryOnProgress;
let progress: Progress = { kind: "waiting", status: "PENDING", slow: false };
// Live 3D itself is tested in live/LiveTryOn.test.tsx; here a stand-in reports the product and "takes" a photo.
const LIVE_PHOTO = new File(["live"], "camera.jpg", { type: "image/jpeg" });
vi.mock("./live/LiveTryOn", () => ({
  default: ({ product, onCapture, onCancel }: { product: { name: string; category: string }; onCapture: (photo: File) => void; onCancel: () => void }) => (
    <div>
      <p>{`Live 3D for ${product.name} (${product.category})`}</p>
      <button type="button" onClick={() => onCapture(LIVE_PHOTO)}>
        Fake live photo
      </button>
      <button type="button" onClick={onCancel}>
        Fake live cancel
      </button>
    </div>
  ),
}));
// The camera itself is tested in CameraCapture.test.tsx; here a stand-in "takes" or cancels a photo.
const CAMERA_PHOTO = new File(["frame"], "camera.jpg", { type: "image/jpeg" });
vi.mock("./CameraCapture", () => ({
  default: ({ onCapture, onCancel }: { onCapture: (photo: File) => void; onCancel: () => void }) => (
    <div>
      <button type="button" onClick={() => onCapture(CAMERA_PHOTO)}>
        Fake take photo
      </button>
      <button type="button" onClick={onCancel}>
        Fake cancel
      </button>
    </div>
  ),
}));

import TryOnStudio, { type StudioProduct } from "./TryOnStudio";

const PRODUCTS: StudioProduct[] = [
  { id: "65f0c0ffee0000000000aaa1", name: "Linen Shirt", imageUrl: "https://res.cloudinary.com/demo/image/upload/shirt.png", category: "UPPER" },
  { id: "65f0c0ffee0000000000aaa2", name: "Summer Dress", imageUrl: "https://res.cloudinary.com/demo/image/upload/dress.png", category: "OVERALL" },
];
const SMALL = new File(["small"], "photo.jpg", { type: "image/jpeg" });

function renderStudio(initialProductId = PRODUCTS[0].id, initialTryOnId: string | null = null) {
  return render(<TryOnStudio products={PRODUCTS} initialProductId={initialProductId} initialTryOnId={initialTryOnId} />);
}

async function choosePhoto() {
  const input = screen.getByLabelText("Choose a photo");
  fireEvent.change(input, { target: { files: [new File(["big"], "IMG_0001.jpg", { type: "image/jpeg" })] } });
  return screen.findByRole("img", { name: "Your photo" });
}

describe("TryOnStudio", () => {
  // Block bodies on purpose: a function returned from beforeEach is run by Vitest as cleanup.
  beforeEach(() => {
    // mockReset, not just the clearAllMocks below: it also drops queued mockResolvedValueOnce results, which a
    // test that fails early leaves behind for the next test (task 70: one failure caused a second one).
    for (const fn of Object.values(m)) fn.mockReset();
    m.shrinkPhoto.mockResolvedValue(SMALL);
    m.createTryOnAction.mockResolvedValue({ error: null, tryOnId: "65f0c0ffee0000000000abcd" });
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:preview"), revokeObjectURL: vi.fn() }));
    progress = { kind: "waiting", status: "PENDING", slow: false };
    m.useTryOnStatus.mockImplementation((id: string | null) => (id ? progress : null));
  });
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    window.history.replaceState(null, "", "/tryon"); // each test starts without ?tryon=
  });

  it("shows the garments with the chosen one selected, and lets you pick another", () => {
    renderStudio(PRODUCTS[1].id);
    expect(screen.getByRole("button", { name: "Summer Dress" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Linen Shirt" })).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(screen.getByRole("button", { name: "Linen Shirt" }));
    expect(screen.getByRole("button", { name: "Linen Shirt" })).toHaveAttribute("aria-pressed", "true");
  });

  it("has no Try on button until a photo is chosen", () => {
    renderStudio();
    expect(screen.queryByRole("button", { name: /^try on/i })).not.toBeInTheDocument();
  });

  it("shrinks the chosen photo and shows a preview with Try on and Retake", async () => {
    renderStudio();
    const preview = await choosePhoto();
    expect(m.shrinkPhoto).toHaveBeenCalledWith(expect.any(File));
    expect(preview).toHaveAttribute("src", "blob:preview");
    expect(screen.getByRole("button", { name: "Try on Linen Shirt" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Retake" })).toBeInTheDocument();
  });

  it("Retake goes back to choosing a photo and frees the preview", async () => {
    renderStudio();
    await choosePhoto();
    fireEvent.click(screen.getByRole("button", { name: "Retake" }));
    expect(screen.queryByRole("img", { name: "Your photo" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Choose a photo")).toBeInTheDocument();
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview"));
  });

  it("Try on sends the chosen garment and the shrunk photo, then says it's started", async () => {
    renderStudio();
    fireEvent.click(screen.getByRole("button", { name: "Summer Dress" }));
    await choosePhoto();
    fireEvent.click(screen.getByRole("button", { name: "Try on Summer Dress" }));

    await waitFor(() => expect(m.createTryOnAction).toHaveBeenCalledTimes(1));
    const formData = m.createTryOnAction.mock.calls[0][1] as FormData;
    expect(formData.get("productId")).toBe(PRODUCTS[1].id);
    expect(formData.get("photo")).toBe(SMALL);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Waiting to start…"));
    expect(m.useTryOnStatus).toHaveBeenLastCalledWith("65f0c0ffee0000000000abcd"); // the loading screen watches it
    expect(screen.getByRole("button", { name: "Try on Summer Dress" })).toBeDisabled(); // no double start
    // Locked after the start, so Retake or another garment can't leave a dead end.
    expect(screen.getByRole("button", { name: "Retake" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Linen Shirt" })).toBeDisabled();
  });

  describe("Live 3D (task 66)", () => {
    function withCamera() {
      vi.stubGlobal("navigator", Object.assign(Object.create(navigator), { mediaDevices: { getUserMedia: vi.fn() } }));
    }

    it("isn't offered when the browser can't use a camera", () => {
      renderStudio();
      expect(screen.queryByRole("button", { name: "Live 3D" })).not.toBeInTheDocument();
    });

    it("opens Live 3D for the chosen garment (with its category), loading it only then", async () => {
      withCamera();
      renderStudio();
      fireEvent.click(screen.getByRole("button", { name: "Summer Dress" }));
      fireEvent.click(screen.getByRole("button", { name: "Live 3D" }));
      expect(await screen.findByText("Live 3D for Summer Dress (OVERALL)")).toBeInTheDocument();
      expect(screen.queryByLabelText("Choose a photo")).not.toBeInTheDocument();
    });

    it("its photo gets the same shrink, preview and Try on as the camera's (both modes kept)", async () => {
      withCamera();
      renderStudio();
      fireEvent.click(screen.getByRole("button", { name: "Live 3D" }));
      fireEvent.click(await screen.findByRole("button", { name: "Fake live photo" }));
      expect(await screen.findByRole("img", { name: "Your photo" })).toBeInTheDocument();
      expect(m.shrinkPhoto).toHaveBeenCalledWith(LIVE_PHOTO);
      expect(screen.getByRole("button", { name: "Try on Linen Shirt" })).toBeEnabled();
      expect(screen.getByRole("heading", { name: "2. Add a photo of yourself" })).toHaveFocus();
    });

    it("Cancel goes back to the photo choices, with focus on the step", async () => {
      withCamera();
      renderStudio();
      fireEvent.click(screen.getByRole("button", { name: "Live 3D" }));
      fireEvent.click(await screen.findByRole("button", { name: "Fake live cancel" }));
      expect(screen.getByRole("button", { name: "Live 3D" })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "2. Add a photo of yourself" })).toHaveFocus();
    });
  });

  describe("the camera (task 42)", () => {
    function withCamera() {
      vi.stubGlobal("navigator", Object.assign(Object.create(navigator), { mediaDevices: { getUserMedia: vi.fn() } }));
    }

    it("offers no camera when the browser can't use one (e.g. not on https)", () => {
      renderStudio();
      expect(screen.queryByRole("button", { name: "Use camera" })).not.toBeInTheDocument();
      expect(screen.getByLabelText("Choose a photo")).toBeInTheDocument();
    });

    it("opens the camera, and its photo gets the same shrink and preview as a chosen one", async () => {
      withCamera();
      renderStudio();
      fireEvent.click(screen.getByRole("button", { name: "Use camera" }));
      fireEvent.click(screen.getByRole("button", { name: "Fake take photo" }));
      expect(await screen.findByRole("img", { name: "Your photo" })).toHaveAttribute("src", "blob:preview");
      expect(m.shrinkPhoto).toHaveBeenCalledWith(CAMERA_PHOTO);
      expect(screen.getByRole("button", { name: "Try on Linen Shirt" })).toBeEnabled();
      expect(screen.queryByRole("button", { name: "Fake take photo" })).not.toBeInTheDocument(); // camera closed
      expect(screen.getByRole("heading", { name: "2. Add a photo of yourself" })).toHaveFocus(); // not lost to the page top
    });

    it("Cancel closes the camera and goes back to the two choices", () => {
      withCamera();
      renderStudio();
      fireEvent.click(screen.getByRole("button", { name: "Use camera" }));
      expect(screen.queryByLabelText("Choose a photo")).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Fake cancel" }));
      expect(screen.getByRole("button", { name: "Use camera" })).toBeInTheDocument();
      expect(screen.getByLabelText("Choose a photo")).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "2. Add a photo of yourself" })).toHaveFocus();
    });
  });

  describe("the loading screen (task 43)", () => {
    const TRYON_ID = "65f0c0ffee0000000000abcd";

    /**
     * Wait until the page SHOWS a try-on being watched, not just until the hook was called with its id: the
     * try-on starts in a transition, which React may pause between rendering (the hook call) and updating the
     * page, so under load a test could look at the page too early (task 70). The address is set in an effect,
     * and effects run only after the page has been updated.
     */
    async function watching(id: string) {
      await waitFor(() => expect(window.location.search).toBe(`?tryon=${id}`));
      expect(m.useTryOnStatus).toHaveBeenLastCalledWith(id);
    }

    async function startTryOn() {
      renderStudio();
      await choosePhoto();
      fireEvent.click(screen.getByRole("button", { name: "Try on Linen Shirt" }));
      await watching(TRYON_ID);
    }

    it("puts the try-on in the address, so a refresh keeps the loading screen", async () => {
      await startTryOn(); // waits for the address (see watching())
      expect(window.location.search).toBe(`?tryon=${TRYON_ID}`);
    });

    it("says it's creating the try-on, with a spinner", async () => {
      progress = { kind: "waiting", status: "PROCESSING", slow: false };
      await startTryOn();
      expect(screen.getByRole("status")).toHaveTextContent("Creating your try-on… This can take a minute.");
      expect(document.querySelector(".animate-spin")).not.toBeNull();
    });

    it("when it's slow, says so and offers the history page", async () => {
      progress = { kind: "waiting", status: "PROCESSING", slow: true };
      await startTryOn();
      expect(screen.getByRole("status")).toHaveTextContent("It's taking longer than usual.");
      expect(screen.getByRole("link", { name: "your history" })).toHaveAttribute("href", "/history");
    });

    it("when it's done, opens the result page once, replacing this page in the history (so Back can't bounce)", async () => {
      progress = { kind: "done", shareId: "Zm9vYmFyYmF6cXV4MTIzNA" };
      await startTryOn();
      await waitFor(() => expect(m.navigate).toHaveBeenCalledWith("/tryon/Zm9vYmFyYmF6cXV4MTIzNA"));
      expect(m.navigate).toHaveBeenCalledTimes(1);
      expect(screen.getByRole("status")).toHaveTextContent("Your try-on is ready. Opening it…");
    });

    it("when it failed, says why, and Try again goes back to the photo (kept) with the address cleaned up", async () => {
      progress = { kind: "failed", message: "Try-on is busy right now. Please try again later." };
      await startTryOn();
      expect(screen.getByRole("alert")).toHaveTextContent("Try-on is busy right now. Please try again later.");
      expect(document.querySelector(".animate-spin")).toBeNull();

      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
      expect(m.useTryOnStatus).toHaveBeenLastCalledWith(null); // stopped watching
      expect(screen.getByRole("button", { name: "Try on Linen Shirt" })).toBeEnabled(); // same photo, ready to go
      expect(screen.getByRole("button", { name: "Linen Shirt" })).toBeEnabled();
      expect(screen.getByRole("status")).toHaveTextContent("");
      expect(window.location.search).toBe("");
      expect(screen.getByRole("heading", { name: "2. Add a photo of yourself" })).toHaveFocus(); // not lost to the page top
    });

    it("never goes back to a dismissed try-on from the address, even after a later start fails", async () => {
      const B = "65f0c0ffee0000000000bbbb";
      progress = { kind: "failed", message: "Try-on is busy right now. Please try again later." };
      m.createTryOnAction
        .mockResolvedValueOnce({ error: null, tryOnId: B })
        .mockResolvedValueOnce({ error: "We couldn't upload your image. Please try again.", tryOnId: null });
      renderStudio(PRODUCTS[0].id, TRYON_ID); // A, from ?tryon= after a refresh
      fireEvent.click(screen.getByRole("button", { name: "Try again" })); // dismiss A
      await choosePhoto();
      fireEvent.click(screen.getByRole("button", { name: "Try on Linen Shirt" })); // B starts, then fails
      await watching(B);
      fireEvent.click(screen.getByRole("button", { name: "Try again" })); // dismiss B
      fireEvent.click(screen.getByRole("button", { name: "Try on Linen Shirt" })); // C can't start
      await waitFor(() => expect(screen.getByText("We couldn't upload your image. Please try again.")).toBeInTheDocument());
      expect(m.useTryOnStatus).toHaveBeenLastCalledWith(null); // not A again
      expect(window.location.search).toBe("");
    });

    it("when it can't be checked any more, points to the history page", async () => {
      progress = { kind: "lost", message: "We couldn't check your try-on. It will be in your history when it's ready." };
      await startTryOn();
      expect(screen.getByRole("alert")).toHaveTextContent("We couldn't check your try-on.");
      expect(screen.getByRole("link", { name: "Go to your history" })).toHaveAttribute("href", "/history");
      expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
    });

    it("after a refresh (?tryon=<id>), watches that try-on straight away, with the photo choices locked", () => {
      window.history.replaceState(null, "", `/tryon?tryon=${TRYON_ID}`);
      renderStudio(PRODUCTS[0].id, TRYON_ID);
      expect(m.useTryOnStatus).toHaveBeenLastCalledWith(TRYON_ID);
      expect(screen.getByRole("status")).toHaveTextContent("Waiting to start…");
      expect(screen.getByLabelText("Choose a photo")).toBeDisabled();
      expect(screen.getByRole("button", { name: "Linen Shirt" })).toBeDisabled();
    });
  });

  it("keeps an (empty) status line in the page from the start, so screen readers announce it later", () => {
    renderStudio();
    expect(screen.getByRole("status")).toHaveTextContent("");
  });

  it("shows the action's friendly error and lets you try again", async () => {
    m.createTryOnAction.mockResolvedValue({ error: "The photo must be 5 MB or smaller.", tryOnId: null });
    renderStudio();
    await choosePhoto();
    fireEvent.click(screen.getByRole("button", { name: "Try on Linen Shirt" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The photo must be 5 MB or smaller.");
    expect(screen.getByRole("button", { name: "Try on Linen Shirt" })).toBeEnabled();
  });

  it("shows a friendly message when the photo can't be read, and no preview", async () => {
    m.shrinkPhoto.mockRejectedValue(new Error("bad image"));
    renderStudio();
    fireEvent.change(screen.getByLabelText("Choose a photo"), {
      target: { files: [new File(["%PDF"], "doc.pdf", { type: "application/pdf" })] },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't read that photo.");
    expect(screen.queryByRole("img", { name: "Your photo" })).not.toBeInTheDocument();
  });
});
