import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { removeFromWishlistAction } = vi.hoisted(() => ({ removeFromWishlistAction: vi.fn() }));
vi.mock("./actions", () => ({ removeFromWishlistAction }));

import RemoveButton from "./RemoveButton";

const ITEM_ID = "65f0c0ffee0000000000abcd";

describe("RemoveButton", () => {
  // Block bodies on purpose: a function returned from beforeEach is run by Vitest as cleanup.
  beforeEach(() => {
    removeFromWishlistAction.mockResolvedValue({ error: null });
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("removes the item by its id", async () => {
    render(<RemoveButton itemId={ITEM_ID} name="Linen Shirt" />);
    fireEvent.click(screen.getByRole("button", { name: "Remove Linen Shirt from wishlist" }));
    await waitFor(() => expect(removeFromWishlistAction).toHaveBeenCalledWith(ITEM_ID));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows the action's friendly error", async () => {
    removeFromWishlistAction.mockResolvedValue({ error: "That item isn't in your wishlist." });
    render(<RemoveButton itemId={ITEM_ID} name="Linen Shirt" />);
    fireEvent.click(screen.getByRole("button", { name: /remove/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That item isn't in your wishlist.");
  });

  it("shows a friendly message if the request itself fails (e.g. offline)", async () => {
    removeFromWishlistAction.mockRejectedValue(new Error("Failed to fetch"));
    render(<RemoveButton itemId={ITEM_ID} name="Linen Shirt" />);
    fireEvent.click(screen.getByRole("button", { name: /remove/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong. Please try again.");
  });

  it("is disabled while removing, so it can't be clicked twice", async () => {
    let finish: (value: { error: null }) => void = () => {};
    removeFromWishlistAction.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    render(<RemoveButton itemId={ITEM_ID} name="Linen Shirt" />);
    const button = screen.getByRole("button", { name: /remove/i });
    fireEvent.click(button);
    await waitFor(() => expect(button).toBeDisabled());
    finish({ error: null });
    await waitFor(() => expect(button).toBeEnabled());
  });
});
