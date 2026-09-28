import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Async Server Component: call it, then render the JSX it returns. The data and notFound() are mocked.
const m = vi.hoisted(() => ({
  getSharedTryOn: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
vi.mock("@/lib/tryons", () => ({ getSharedTryOn: m.getSharedTryOn }));
vi.mock("next/navigation", () => ({ notFound: m.notFound, unstable_rethrow: vi.fn() }));
// The slider is tested in BeforeAfter.test.tsx; here we only check what the page hands it.
vi.mock("./BeforeAfter", () => ({
  default: ({ beforeUrl, afterUrl }: { beforeUrl: string; afterUrl: string }) => (
    <div data-testid="slider" data-before={beforeUrl} data-after={afterUrl} />
  ),
}));

import SharedTryOnPage, { metadata } from "./page";

const SHARE = "Zm9vYmFyYmF6cXV4MTIzNA";
const PERSON = "https://res.cloudinary.com/demo/image/upload/v1/mirror-ai/people/p.jpg";
const RESULT = "https://res.cloudinary.com/demo/image/upload/v1/mirror-ai/results/r.png";
const shared = (over: Record<string, unknown> = {}) => ({
  status: "DONE",
  personUrl: PERSON,
  resultUrl: RESULT,
  createdAt: new Date(),
  product: { name: "Linen Shirt" },
  ...over,
});

async function renderPage(shareId = SHARE) {
  render(await SharedTryOnPage({ params: Promise.resolve({ shareId }) }));
}

describe("/tryon/[shareId] (public by link)", () => {
  beforeEach(() => {
    m.getSharedTryOn.mockResolvedValue(shared());
  });
  afterEach(() => vi.clearAllMocks());

  it("looks the try-on up by the share token in the link", async () => {
    await renderPage();
    expect(m.getSharedTryOn).toHaveBeenCalledWith(SHARE);
  });

  it("shows a finished try-on: the product, the before/after slider, and a download", async () => {
    await renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "Trying on: Linen Shirt" })).toBeInTheDocument();
    expect(screen.getByTestId("slider")).toHaveAttribute("data-before", PERSON);
    expect(screen.getByTestId("slider")).toHaveAttribute("data-after", RESULT);
    expect(screen.getByRole("link", { name: "Download the result" })).toHaveAttribute(
      "href",
      "https://res.cloudinary.com/demo/image/upload/fl_attachment/v1/mirror-ai/results/r.png",
    );
    expect(screen.getByText(/deleted after 24 hours/i)).toBeInTheDocument();
  });

  it.each([
    ["PENDING", "This try-on is still being created."],
    ["PROCESSING", "This try-on is still being created."],
    ["FAILED", "This try-on didn't work."],
  ])("shows %s as a message, with no photos or download", async (status, text) => {
    m.getSharedTryOn.mockResolvedValue(shared({ status, resultUrl: null }));
    await renderPage();
    expect(screen.getByText(text, { exact: false })).toBeInTheDocument();
    expect(screen.queryByTestId("slider")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /download/i })).not.toBeInTheDocument();
  });

  it("is a 404 for an unknown or expired link (including an ObjectId instead of a token)", async () => {
    m.getSharedTryOn.mockResolvedValue(null);
    await expect(SharedTryOnPage({ params: Promise.resolve({ shareId: "65f0c0ffee0000000000abcd" }) })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(m.notFound).toHaveBeenCalled();
  });

  it("shows a friendly message (not a 404, not a stack trace) when the database fails", async () => {
    m.getSharedTryOn.mockRejectedValue(new Error("connection refused (mongodb+srv://...)"));
    await renderPage();
    expect(screen.getByRole("alert")).toHaveTextContent("We couldn't load this try-on. Please try again.");
    expect(screen.queryByText(/mongodb/)).not.toBeInTheDocument();
    expect(m.notFound).not.toHaveBeenCalled();
  });

  it("asks search engines not to index shared links or their images, and sends no referrer", () => {
    expect(metadata.robots).toEqual({ index: false, follow: false, noimageindex: true });
    expect(metadata.referrer).toBe("no-referrer");
  });
});
