import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Async Server Component: call it, then render the JSX it returns. Clerk, the cookie and data are mocked.
const m = vi.hoisted(() => ({ auth: vi.fn(), getAnonymousId: vi.fn(), listWishlist: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth: m.auth }));
vi.mock("@/lib/anonymous-id", () => ({ getAnonymousId: m.getAnonymousId }));
vi.mock("@/lib/wishlist", async () => {
  const actual = await vi.importActual<typeof import("@/lib/wishlist")>("@/lib/wishlist");
  return { WishlistError: actual.WishlistError, listWishlist: m.listWishlist };
});
// The button is tested in RemoveButton.test.tsx; here we only check it's placed per item.
vi.mock("./ClaimAnonymousWishlist", () => ({ default: () => <p data-testid="claim">claiming</p> }));
vi.mock("./RemoveButton", () => ({
  default: ({ itemId, name }: { itemId: string; name: string }) => <span data-testid="remove">{`${itemId}:${name}`}</span>,
}));

import { WishlistError } from "@/lib/wishlist";
import WishlistPage from "./page";

const ANON = "3f2b8c1e-9d4a-4b7e-8a21-5c6d7e8f9a0b";
const entry = (over: Record<string, unknown> = {}) => ({
  id: "65f0c0ffee0000000000abcd",
  createdAt: new Date(),
  product: {
    id: "65f0c0ffee0000000000beef",
    name: "Linen Shirt",
    imageUrl: "https://res.cloudinary.com/demo/image/upload/shirt.png",
    price: 29.99,
    buyLink: "https://shop.example.com/linen-shirt",
  },
  ...over,
});

async function renderPage() {
  render(await WishlistPage());
  return screen.getByRole("region", { name: "Saved garments" });
}

describe("/wishlist", () => {
  beforeEach(() => {
    m.auth.mockResolvedValue({ userId: null });
    m.getAnonymousId.mockResolvedValue(null);
    m.listWishlist.mockResolvedValue([]);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("shows the signed-in user's wishlist", async () => {
    m.auth.mockResolvedValue({ userId: "user_123" });
    m.listWishlist.mockResolvedValue([entry()]);
    const region = await renderPage();
    expect(m.listWishlist).toHaveBeenCalledWith({ userId: "user_123" }); // never the anonymous list
    expect(within(region).getByRole("heading", { level: 2, name: "Linen Shirt" })).toBeInTheDocument();
    expect(screen.queryByTestId("claim")).not.toBeInTheDocument(); // no cookie: nothing to move
  });

  it("signed in with a leftover anonymous cookie, starts moving those items into the account", async () => {
    m.auth.mockResolvedValue({ userId: "user_123" });
    m.getAnonymousId.mockResolvedValue(ANON);
    await renderPage();
    expect(screen.getByTestId("claim")).toBeInTheDocument();
    expect(m.listWishlist).toHaveBeenCalledWith({ userId: "user_123" });
  });

  it("signed out, shows the anonymous visitor's wishlist from their cookie", async () => {
    m.getAnonymousId.mockResolvedValue(ANON);
    m.listWishlist.mockResolvedValue([entry()]);
    await renderPage();
    expect(m.listWishlist).toHaveBeenCalledWith({ anonymousId: ANON });
    expect(screen.queryByTestId("claim")).not.toBeInTheDocument(); // signed out: nothing to move
  });

  it("signed out with no cookie, shows the empty state without touching the database", async () => {
    const region = await renderPage();
    expect(m.listWishlist).not.toHaveBeenCalled();
    expect(within(region).getByText(/your wishlist is empty/i)).toBeInTheDocument();
    expect(within(region).getByRole("link", { name: "Browse garments" })).toHaveAttribute("href", "/");
  });

  it("shows each item's photo, price, try-on and buy links, and a remove button", async () => {
    m.auth.mockResolvedValue({ userId: "user_123" });
    m.listWishlist.mockResolvedValue([entry()]);
    const region = await renderPage();
    const item = within(region).getByRole("listitem");
    expect(within(item).getByRole("img", { name: "Linen Shirt" })).toBeInTheDocument();
    expect(within(item).getByText("$29.99")).toBeInTheDocument();
    expect(within(item).getByRole("link", { name: "Try it on: Linen Shirt" })).toHaveAttribute(
      "href",
      "/tryon?product=65f0c0ffee0000000000beef",
    );
    const buy = within(item).getByRole("link", { name: "Buy: Linen Shirt (opens in a new tab)" });
    expect(buy).toHaveAttribute("rel", "noopener noreferrer");
    expect(within(item).getByTestId("remove")).toHaveTextContent("65f0c0ffee0000000000abcd:Linen Shirt");
  });

  it("leaves out the price and buy link when a product has none", async () => {
    m.auth.mockResolvedValue({ userId: "user_123" });
    m.listWishlist.mockResolvedValue([entry({ product: { ...entry().product, price: null, buyLink: null } })]);
    const region = await renderPage();
    expect(within(region).queryByText(/\$/)).not.toBeInTheDocument();
    expect(within(region).queryByRole("link", { name: /buy/i })).not.toBeInTheDocument();
  });

  it("shows a friendly message (not a stack trace) when the database fails, without logging it twice", async () => {
    m.auth.mockResolvedValue({ userId: "user_123" });
    m.listWishlist.mockRejectedValue(new WishlistError("DB_ERROR", "Something went wrong with your wishlist."));
    const region = await renderPage();
    expect(within(region).getByRole("alert")).toHaveTextContent("We couldn't load your wishlist. Please try again.");
    expect(console.error).not.toHaveBeenCalled(); // lib/wishlist already logged it
  });

  it("shows the friendly message AND logs it when something else fails (e.g. Clerk)", async () => {
    const clerkError = new Error("connection refused (mongodb+srv://...)");
    m.auth.mockRejectedValue(clerkError);
    const region = await renderPage();
    expect(within(region).getByRole("alert")).toHaveTextContent("We couldn't load your wishlist. Please try again.");
    expect(region).not.toHaveTextContent("mongodb");
    expect(console.error).toHaveBeenCalledWith("[wishlist page] Unexpected error:", clerkError);
    expect(m.listWishlist).not.toHaveBeenCalled();
  });
});
