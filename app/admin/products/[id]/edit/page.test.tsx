import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  getProduct: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
vi.mock("@/lib/auth", () => ({ requireAdmin: m.requireAdmin }));
vi.mock("@/lib/products", () => ({ getProduct: m.getProduct }));
vi.mock("next/navigation", () => ({ notFound: m.notFound }));
vi.mock("../../actions", () => ({ updateProductAction: { bind: () => vi.fn() } }));

import EditProductPage from "./page";

const ID = "65f0c0ffee0000000000abcd";
const params = { params: Promise.resolve({ id: ID }) } as Parameters<typeof EditProductPage>[0];

describe("/admin/products/[id]/edit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.requireAdmin.mockResolvedValue("user_admin");
  });

  it("is admin-only, checked before loading the product", async () => {
    m.requireAdmin.mockRejectedValue(new Error("NEXT_NOT_FOUND"));
    await expect(EditProductPage(params)).rejects.toThrow("NEXT_NOT_FOUND");
    expect(m.getProduct).not.toHaveBeenCalled();
  });

  it("gives a 404 for an unknown product", async () => {
    m.getProduct.mockResolvedValue(null);
    await expect(EditProductPage(params)).rejects.toThrow("NEXT_NOT_FOUND");
    expect(m.getProduct).toHaveBeenCalledWith(ID);
  });

  it("shows the form prefilled with the product", async () => {
    m.getProduct.mockResolvedValue({
      id: ID,
      name: "Linen Shirt",
      category: "UPPER",
      price: 29.99,
      description: null,
      buyLink: null,
      isActive: true,
      imageUrl: "https://res.cloudinary.com/demo/image/upload/shirt.png",
    });
    render(await EditProductPage(params));
    expect(screen.getByRole("heading", { name: "Edit Linen Shirt" })).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveValue("Linen Shirt");
  });
});
