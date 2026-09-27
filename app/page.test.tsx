import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Async Server Component: call it, then render the JSX. Data and Next's request APIs are mocked.
const { listActiveProducts, connection } = vi.hoisted(() => ({
  listActiveProducts: vi.fn(),
  connection: vi.fn(),
}));
vi.mock("next/server", () => ({ connection }));
vi.mock("@/lib/products", async () => {
  const actual = await vi.importActual<typeof import("@/lib/products")>("@/lib/products");
  return { ProductError: actual.ProductError, listActiveProducts };
});

import { ProductError } from "@/lib/products";
import Home from "./page";

const product = (over: Record<string, unknown> = {}) => ({
  id: "65f0c0ffee0000000000abcd",
  name: "Linen Shirt",
  imageUrl: "https://res.cloudinary.com/demo/image/upload/shirt.png",
  category: "UPPER",
  price: 29.99,
  buyLink: "https://shop.example.com/linen-shirt",
  ...over,
});

async function renderHome() {
  render(await Home());
}

describe("Home page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    connection.mockResolvedValue(undefined);
  });

  it("renders per request (connection) before loading products", async () => {
    listActiveProducts.mockResolvedValue([]);
    await renderHome();
    expect(connection).toHaveBeenCalledTimes(1);
    expect(connection.mock.invocationCallOrder[0]).toBeLessThan(listActiveProducts.mock.invocationCallOrder[0]);
  });

  it("shows the product name, explanation, and a Try it on button", async () => {
    listActiveProducts.mockResolvedValue([]);
    await renderHome();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Mirror AI");
    expect(screen.getByText(/see how clothes look on you before you buy/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Try it on" })).toHaveAttribute("href", "/tryon");
  });

  it("lists each active product as a card (card details are tested in ProductCard.test.tsx)", async () => {
    listActiveProducts.mockResolvedValue([
      product(),
      product({ id: "65f0c0ffee0000000000abce", name: "Denim Skirt", category: "LOWER", price: null, buyLink: null }),
    ]);
    await renderHome();
    const items = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByRole("heading", { name: "Linen Shirt" })).toBeInTheDocument();
    expect(within(items[1]).getByRole("heading", { name: "Denim Skirt" })).toBeInTheDocument();
  });

  it("shows an empty state", async () => {
    listActiveProducts.mockResolvedValue([]);
    await renderHome();
    expect(screen.getByText("New garments are coming soon.")).toBeInTheDocument();
  });

  it("keeps the page up with a friendly message when products can't load", async () => {
    listActiveProducts.mockRejectedValue(
      new ProductError("DB_ERROR", "Something went wrong with the products. Please try again."),
    );
    await renderHome();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Mirror AI");
    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong with the products.");
  });

  it("uses a generic message for unexpected errors", async () => {
    listActiveProducts.mockRejectedValue(new Error("ECONNREFUSED 10.0.0.5"));
    await renderHome();
    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong. Please try again.");
    expect(screen.getByRole("alert")).not.toHaveTextContent("10.0.0.5");
  });
});
