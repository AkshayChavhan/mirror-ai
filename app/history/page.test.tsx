import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Async Server Component: call it, then render the JSX it returns. Auth and data are mocked.
const { requireUser, listRecentTryOns } = vi.hoisted(() => ({ requireUser: vi.fn(), listRecentTryOns: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireUser }));
vi.mock("@/lib/tryons", () => ({ listRecentTryOns }));

import HistoryPage from "./page";

const NOW = new Date("2026-09-28T12:00:00Z");
const tryOn = (over: Record<string, unknown>) => ({
  id: "65f0c0ffee0000000000abcd",
  status: "DONE",
  resultUrl: "https://res.cloudinary.com/demo/image/upload/mirror-ai/results/r.png",
  errorMessage: null,
  createdAt: new Date(NOW.getTime() - 5 * 60_000),
  product: { name: "Linen Shirt" },
  ...over,
});

async function renderPage() {
  render(await HistoryPage());
  return screen.getByRole("region", { name: "Try-ons" });
}

describe("/history", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] }); // a fixed "now" for "5 min ago"
    vi.setSystemTime(NOW);
    requireUser.mockResolvedValue("user_123");
    listRecentTryOns.mockResolvedValue([]);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("checks sign-in before loading anything", async () => {
    requireUser.mockRejectedValue(new Error("NEXT_REDIRECT:/sign-in"));
    await expect(HistoryPage()).rejects.toThrow("NEXT_REDIRECT:/sign-in");
    expect(listRecentTryOns).not.toHaveBeenCalled();
  });

  it("loads only the signed-in user's try-ons and says they're deleted after 24 hours", async () => {
    await renderPage();
    expect(listRecentTryOns).toHaveBeenCalledWith("user_123");
    expect(screen.getByRole("heading", { level: 1, name: "Your try-ons" })).toBeInTheDocument();
    expect(screen.getByText(/after that, they and your photos are deleted/i)).toBeInTheDocument();
  });

  it("shows a finished try-on's result with the product name and how long ago", async () => {
    listRecentTryOns.mockResolvedValue([tryOn({})]);
    const region = await renderPage();
    const item = within(region).getByRole("listitem");
    expect(within(item).getByRole("img", { name: "You wearing Linen Shirt" })).toBeInTheDocument();
    expect(within(item).getByRole("heading", { name: "Linen Shirt" })).toBeInTheDocument();
    expect(within(item).getByText("5 min ago")).toHaveAttribute("datetime", "2026-09-28T11:55:00.000Z");
  });

  it("loads the photo straight from Cloudinary, never through Next's image cache (it can't be deleted)", async () => {
    listRecentTryOns.mockResolvedValue([tryOn({})]);
    const region = await renderPage();
    const img = within(region).getByRole("img", { name: "You wearing Linen Shirt" });
    expect(img).toHaveAttribute("src", "https://res.cloudinary.com/demo/image/upload/mirror-ai/results/r.png");
    expect(img.getAttribute("src")).not.toContain("/_next/image");
  });

  it.each([
    ["PENDING", null, "Waiting to start…"],
    ["PROCESSING", null, "Creating your try-on…"],
    ["FAILED", "Try-on is busy right now. Please try again later.", "Try-on is busy right now. Please try again later."],
    ["FAILED", null, "This try-on didn't work."],
    ["DONE", null, "Your try-on is ready."], // DONE without a result image (shouldn't happen)
  ])("shows %s (message %j) as text instead of an image", async (status, errorMessage, text) => {
    listRecentTryOns.mockResolvedValue([tryOn({ status, errorMessage, resultUrl: null })]);
    const region = await renderPage();
    expect(within(region).getByText(text)).toBeInTheDocument();
    expect(within(region).queryByRole("img")).not.toBeInTheDocument();
  });

  it("lists try-ons in the order it gets them (newest first)", async () => {
    listRecentTryOns.mockResolvedValue([
      tryOn({ id: "65f0c0ffee0000000000aaa1", product: { name: "Newer" } }),
      tryOn({ id: "65f0c0ffee0000000000aaa2", product: { name: "Older" }, createdAt: new Date(NOW.getTime() - 3 * 3_600_000) }),
    ]);
    const region = await renderPage();
    const names = within(region).getAllByRole("heading").map((h) => h.textContent);
    expect(names).toEqual(["Newer", "Older"]);
    expect(within(region).getByText("3 h ago")).toBeInTheDocument();
  });

  it("shows an empty state with a link to try something on", async () => {
    const region = await renderPage();
    expect(within(region).getByText(/no try-ons in the last 24 hours/i)).toBeInTheDocument();
    expect(within(region).getByRole("link", { name: "Try something on" })).toHaveAttribute("href", "/tryon");
  });

  it("shows a friendly message (not a stack trace) when loading fails", async () => {
    listRecentTryOns.mockRejectedValue(new Error("connection refused (mongodb+srv://...)"));
    const region = await renderPage();
    expect(within(region).getByRole("alert")).toHaveTextContent("We couldn't load your try-ons. Please try again.");
    expect(region).not.toHaveTextContent("mongodb");
  });
});
