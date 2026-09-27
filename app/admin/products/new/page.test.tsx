import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireAdmin } = vi.hoisted(() => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireAdmin }));
vi.mock("../actions", () => ({ createProductAction: vi.fn() }));

import NewProductPage from "./page";

describe("/admin/products/new", () => {
  beforeEach(() => vi.clearAllMocks());

  it("is admin-only", async () => {
    requireAdmin.mockRejectedValue(new Error("NEXT_NOT_FOUND"));
    await expect(NewProductPage()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("shows an empty product form", async () => {
    requireAdmin.mockResolvedValue("user_admin");
    render(await NewProductPage());
    expect(screen.getByRole("heading", { name: "New product" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create product" })).toBeInTheDocument();
  });
});
