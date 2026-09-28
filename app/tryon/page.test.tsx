import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Async Server Component: call it, then render the JSX it returns. Auth and data are mocked.
const m = vi.hoisted(() => ({ requireUser: vi.fn(), listActiveProducts: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireUser: m.requireUser }));
vi.mock("@/lib/products", () => ({ listActiveProducts: m.listActiveProducts }));
// The studio is tested in TryOnStudio.test.tsx; here we only check what the page hands it.
vi.mock("./TryOnStudio", () => ({
  default: ({ products, initialProductId }: { products: unknown[]; initialProductId: string }) => (
    <div data-testid="studio" data-products={JSON.stringify(products)} data-initial={initialProductId} />
  ),
}));

import TryOnPage from "./page";

const product = (id: string, name: string) => ({
  id,
  name,
  imageUrl: `https://res.cloudinary.com/demo/image/upload/${name}.png`,
  category: "UPPER",
  price: 29.99,
  description: "secret admin notes",
  buyLink: "https://shop.example.com",
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
});
const A = product("65f0c0ffee0000000000aaa1", "shirt");
const B = product("65f0c0ffee0000000000aaa2", "dress");

async function renderPage(search: Record<string, string | string[] | undefined> = {}) {
  render(await TryOnPage({ searchParams: Promise.resolve(search) }));
}

describe("/tryon", () => {
  beforeEach(() => {
    m.requireUser.mockResolvedValue("user_123");
    m.listActiveProducts.mockResolvedValue([A, B]);
  });
  afterEach(() => vi.clearAllMocks());

  it("checks sign-in before loading anything", async () => {
    m.requireUser.mockRejectedValue(new Error("NEXT_REDIRECT:/sign-in"));
    await expect(TryOnPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("NEXT_REDIRECT:/sign-in");
    expect(m.listActiveProducts).not.toHaveBeenCalled();
  });

  it("passes only each garment's id, name and image to the browser", async () => {
    await renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "Try it on" })).toBeInTheDocument();
    const products = JSON.parse(screen.getByTestId("studio").getAttribute("data-products") ?? "[]");
    expect(products).toEqual([
      { id: A.id, name: "shirt", imageUrl: A.imageUrl },
      { id: B.id, name: "dress", imageUrl: B.imageUrl },
    ]);
  });

  it("preselects the garment from ?product=", async () => {
    await renderPage({ product: B.id });
    expect(screen.getByTestId("studio")).toHaveAttribute("data-initial", B.id);
  });

  it.each([
    ["no ?product", {}],
    ["an unknown product", { product: "65f0c0ffee000000000000ff" }],
    ["a repeated ?product", { product: [B.id, A.id] }],
  ])("falls back to the first garment for %s", async (_case, search) => {
    await renderPage(search);
    expect(screen.getByTestId("studio")).toHaveAttribute("data-initial", A.id);
  });

  it("says so, with a way back, when there are no garments", async () => {
    m.listActiveProducts.mockResolvedValue([]);
    await renderPage();
    expect(screen.getByText(/no garments to try on yet/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to the home page" })).toHaveAttribute("href", "/");
    expect(screen.queryByTestId("studio")).not.toBeInTheDocument();
  });

  it("shows a friendly message when the garments can't be loaded", async () => {
    m.listActiveProducts.mockRejectedValue(new Error("connection refused (mongodb+srv://...)"));
    await renderPage();
    expect(screen.getByRole("alert")).toHaveTextContent("We couldn't load the garments. Please try again.");
    expect(screen.queryByText(/mongodb/)).not.toBeInTheDocument();
  });
});
