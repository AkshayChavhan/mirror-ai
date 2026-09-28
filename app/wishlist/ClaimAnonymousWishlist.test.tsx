import { render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { claimAnonymousWishlistAction } = vi.hoisted(() => ({ claimAnonymousWishlistAction: vi.fn() }));
vi.mock("./actions", () => ({ claimAnonymousWishlistAction }));

import ClaimAnonymousWishlist from "./ClaimAnonymousWishlist";

describe("ClaimAnonymousWishlist", () => {
  // Block bodies on purpose: a function returned from beforeEach is run by Vitest as cleanup.
  beforeEach(() => {
    claimAnonymousWishlistAction.mockResolvedValue({ moved: 2, error: null });
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("claims once when the page opens, even under StrictMode's double effects", async () => {
    render(
      <StrictMode>
        <ClaimAnonymousWishlist />
      </StrictMode>,
    );
    await waitFor(() => expect(claimAnonymousWishlistAction).toHaveBeenCalledTimes(1));
  });

  it("says it's moving the items while it works, then shows nothing", async () => {
    let finish: (value: { moved: number; error: null }) => void = () => {};
    claimAnonymousWishlistAction.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    render(<ClaimAnonymousWishlist />);
    expect(await screen.findByRole("status")).toHaveTextContent("Moving your saved items to your account…");
    finish({ moved: 2, error: null });
    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
  });

  it("shows the action's friendly error", async () => {
    claimAnonymousWishlistAction.mockResolvedValue({ moved: 0, error: "Something went wrong with your wishlist." });
    render(<ClaimAnonymousWishlist />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong with your wishlist.");
  });

  it("shows a friendly message if the request itself fails (e.g. offline)", async () => {
    claimAnonymousWishlistAction.mockRejectedValue(new Error("Failed to fetch"));
    render(<ClaimAnonymousWishlist />);
    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't move your saved items. Please reload the page.");
  });
});
