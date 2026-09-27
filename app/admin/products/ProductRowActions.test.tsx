import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { deleteProductAction, setProductActiveAction } = vi.hoisted(() => ({
  deleteProductAction: vi.fn(),
  setProductActiveAction: vi.fn(),
}));
vi.mock("./actions", () => ({ deleteProductAction, setProductActiveAction }));

import ProductRowActions from "./ProductRowActions";

const ID = "65f0c0ffee0000000000abcd";

describe("ProductRowActions", () => {
  beforeEach(() => {
    deleteProductAction.mockResolvedValue({ error: null });
    setProductActiveAction.mockResolvedValue({ error: null });
  });
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("hides a visible product", async () => {
    render(<ProductRowActions id={ID} name="Linen Shirt" isActive />);
    fireEvent.click(screen.getByRole("button", { name: "Hide Linen Shirt" }));
    await waitFor(() => expect(setProductActiveAction).toHaveBeenCalledWith(ID, false));
  });

  it("shows a hidden product", async () => {
    render(<ProductRowActions id={ID} name="Linen Shirt" isActive={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Show Linen Shirt" }));
    await waitFor(() => expect(setProductActiveAction).toHaveBeenCalledWith(ID, true));
  });

  it("does NOT delete when the confirmation is cancelled", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<ProductRowActions id={ID} name="Linen Shirt" isActive />);
    fireEvent.click(screen.getByRole("button", { name: "Delete Linen Shirt" }));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('Delete "Linen Shirt"?'));
    expect(deleteProductAction).not.toHaveBeenCalled();
  });

  it("deletes after confirmation", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<ProductRowActions id={ID} name="Linen Shirt" isActive />);
    fireEvent.click(screen.getByRole("button", { name: "Delete Linen Shirt" }));
    await waitFor(() => expect(deleteProductAction).toHaveBeenCalledWith(ID));
  });

  it("shows a friendly message if the action call itself fails (e.g. network drop)", async () => {
    setProductActiveAction.mockRejectedValue(new TypeError("Failed to fetch"));
    render(<ProductRowActions id={ID} name="Linen Shirt" isActive />);
    fireEvent.click(screen.getByRole("button", { name: "Hide Linen Shirt" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong. Please try again."));
  });

  it("shows the action's error message", async () => {
    setProductActiveAction.mockResolvedValue({ error: "That product doesn't exist." });
    render(<ProductRowActions id={ID} name="Linen Shirt" isActive />);
    fireEvent.click(screen.getByRole("button", { name: "Hide Linen Shirt" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("That product doesn't exist."));
  });
});
