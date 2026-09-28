import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ createTryOnAction: vi.fn(), shrinkPhoto: vi.fn() }));
vi.mock("./actions", () => ({ createTryOnAction: m.createTryOnAction }));
vi.mock("./shrinkPhoto", () => ({ shrinkPhoto: m.shrinkPhoto }));

import TryOnStudio, { type StudioProduct } from "./TryOnStudio";

const PRODUCTS: StudioProduct[] = [
  { id: "65f0c0ffee0000000000aaa1", name: "Linen Shirt", imageUrl: "https://res.cloudinary.com/demo/image/upload/shirt.png" },
  { id: "65f0c0ffee0000000000aaa2", name: "Summer Dress", imageUrl: "https://res.cloudinary.com/demo/image/upload/dress.png" },
];
const SMALL = new File(["small"], "photo.jpg", { type: "image/jpeg" });

function renderStudio(initialProductId = PRODUCTS[0].id) {
  render(<TryOnStudio products={PRODUCTS} initialProductId={initialProductId} />);
}

async function choosePhoto() {
  const input = screen.getByLabelText("Choose a photo");
  fireEvent.change(input, { target: { files: [new File(["big"], "IMG_0001.jpg", { type: "image/jpeg" })] } });
  return screen.findByRole("img", { name: "Your photo" });
}

describe("TryOnStudio", () => {
  // Block bodies on purpose: a function returned from beforeEach is run by Vitest as cleanup.
  beforeEach(() => {
    m.shrinkPhoto.mockResolvedValue(SMALL);
    m.createTryOnAction.mockResolvedValue({ error: null, tryOnId: "65f0c0ffee0000000000abcd" });
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:preview"), revokeObjectURL: vi.fn() }));
  });
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
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
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("We're creating your try-on."));
    expect(screen.getByRole("button", { name: "Try on Summer Dress" })).toBeDisabled(); // no double start
    // Locked after the start, so Retake or another garment can't leave a dead end.
    expect(screen.getByRole("button", { name: "Retake" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Linen Shirt" })).toBeDisabled();
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
