import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { addToWishlistAction } = vi.hoisted(() => ({ addToWishlistAction: vi.fn() }));
vi.mock("./wishlist/actions", () => ({ addToWishlistAction }));

import SaveButton from "./SaveButton";

const PRODUCT_ID = "65f0c0ffee0000000000beef";

describe("SaveButton", () => {
  // Block bodies on purpose: a function returned from beforeEach is run by Vitest as cleanup.
  beforeEach(() => {
    addToWishlistAction.mockResolvedValue({ error: null });
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("saves the product, then says so and links to the wishlist", async () => {
    render(<SaveButton productId={PRODUCT_ID} name="Linen Shirt" />);
    fireEvent.click(screen.getByRole("button", { name: "Save Linen Shirt to wishlist" }));
    await waitFor(() => expect(addToWishlistAction).toHaveBeenCalledWith(PRODUCT_ID));
    expect(await screen.findByRole("status")).toHaveTextContent("Saved");
    expect(screen.getByRole("link", { name: "View wishlist" })).toHaveAttribute("href", "/wishlist");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows the action's friendly error and keeps the button", async () => {
    addToWishlistAction.mockResolvedValue({ error: "That garment isn't available any more." });
    render(<SaveButton productId={PRODUCT_ID} name="Linen Shirt" />);
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That garment isn't available any more.");
    expect(screen.getByRole("button", { name: /save/i })).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows a friendly message if the request itself fails (e.g. offline)", async () => {
    addToWishlistAction.mockRejectedValue(new Error("Failed to fetch"));
    render(<SaveButton productId={PRODUCT_ID} name="Linen Shirt" />);
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong. Please try again.");
  });
});
