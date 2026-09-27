import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Async Server Component: call it, then render the JSX it returns. Auth and data are mocked.
const { requireAdmin, listAllProducts } = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  listAllProducts: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ requireAdmin }));
vi.mock("@/lib/products", async () => {
  const actual = await vi.importActual<typeof import("@/lib/products")>("@/lib/products");
  return { ProductError: actual.ProductError, listAllProducts };
});

// The row buttons are tested in ProductRowActions.test.tsx; here we only check they're placed per row.
vi.mock("./ProductRowActions", () => ({
  default: ({ name, isActive }: { name: string; isActive: boolean }) => (
    <span data-testid="row-actions">{`${name}:${isActive ? "visible" : "hidden"}`}</span>
  ),
}));

import { ProductError } from "@/lib/products";
import AdminProductsPage from "./page";

const product = (over: Record<string, unknown>) => ({
  id: "65f0c0ffee0000000000abcd",
  name: "Linen Shirt",
  imageUrl: "https://res.cloudinary.com/demo/image/upload/shirt.png",
  category: "UPPER",
  price: 29.99,
  description: null,
  buyLink: null,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...over,
});

async function renderPage() {
  render(await AdminProductsPage());
}

describe("/admin/products", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdmin.mockResolvedValue("user_admin");
  });

  it("checks admin access before loading products", async () => {
    requireAdmin.mockRejectedValue(new Error("NEXT_NOT_FOUND"));
    await expect(AdminProductsPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(listAllProducts).not.toHaveBeenCalled();
  });

  it("lists every product, including hidden ones", async () => {
    listAllProducts.mockResolvedValue([
      product({}),
      product({ id: "65f0c0ffee0000000000abce", name: "Denim Skirt", category: "LOWER", price: null, isActive: false }),
    ]);
    await renderPage();
    expect(requireAdmin).toHaveBeenCalledTimes(1);

    const rows = screen.getAllByRole("row").slice(1); // skip the header row
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getAllByRole("cell").map((c) => c.textContent)).toEqual([
      "Linen Shirt",
      "Top",
      "$29.99",
      "Visible",
      "EditLinen Shirt:visible",
    ]);
    expect(within(rows[1]).getAllByRole("cell").map((c) => c.textContent)).toEqual([
      "Denim Skirt",
      "Bottom",
      "—",
      "Hidden",
      "EditDenim Skirt:hidden",
    ]);
    expect(screen.getByRole("link", { name: "Edit Linen Shirt" })).toHaveAttribute(
      "href",
      "/admin/products/65f0c0ffee0000000000abcd/edit",
    );
    expect(screen.getByRole("link", { name: "New product" })).toHaveAttribute("href", "/admin/products/new");
  });

  it("shows an empty state", async () => {
    listAllProducts.mockResolvedValue([]);
    await renderPage();
    expect(screen.getByText("No products yet.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("shows a friendly message when products can't load", async () => {
    listAllProducts.mockRejectedValue(
      new ProductError("DB_ERROR", "Something went wrong with the products. Please try again."),
    );
    await renderPage();
    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong with the products.");
  });

  it("falls back to a generic message for unexpected errors", async () => {
    listAllProducts.mockRejectedValue(new Error("socket hang up"));
    await renderPage();
    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong. Please try again.");
    expect(screen.getByRole("alert")).not.toHaveTextContent("socket");
  });
});
