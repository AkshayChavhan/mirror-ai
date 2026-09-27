import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ComponentProps } from "react";
import ProductCard from "./ProductCard";

type CardProduct = ComponentProps<typeof ProductCard>["product"];

const base: CardProduct = {
  id: "65f0c0ffee0000000000abcd",
  name: "Linen Shirt",
  imageUrl: "https://res.cloudinary.com/demo/image/upload/shirt.png",
  category: "UPPER",
  price: 29.99,
  buyLink: "https://shop.example.com/linen-shirt",
};

function renderCard(over: Partial<CardProduct> = {}) {
  render(
    <ul>
      <ProductCard product={{ ...base, ...over }} />
    </ul>,
  );
}

describe("ProductCard", () => {
  it("shows the garment photo with the product name as alt text", () => {
    renderCard();
    expect(screen.getByRole("img", { name: "Linen Shirt" })).toBeInTheDocument();
  });

  it("shows the name as a level-3 heading (under the Garments h2)", () => {
    renderCard();
    expect(screen.getByRole("heading", { level: 3, name: "Linen Shirt" })).toBeInTheDocument();
  });

  it.each([
    ["UPPER", "Top"],
    ["LOWER", "Bottom"],
    ["OVERALL", "Dress"],
  ] as const)("labels category %s as %s", (category, label) => {
    renderCard({ category });
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("shows the price with two decimals", () => {
    renderCard({ price: 5 });
    expect(screen.getByText("$5.00")).toBeInTheDocument();
  });

  it("hides the price when it's null", () => {
    renderCard({ price: null });
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  });

  it("links 'Try it on' to /tryon with the product, and its name starts with the visible text", () => {
    renderCard();
    const link = screen.getByRole("link", { name: "Try it on: Linen Shirt" });
    expect(link).toHaveTextContent("Try it on");
    expect(link).toHaveAttribute("href", "/tryon?product=65f0c0ffee0000000000abcd");
  });

  it("opens the buy link in a new tab safely", () => {
    renderCard();
    const buy = screen.getByRole("link", { name: "Buy: Linen Shirt (opens in a new tab)" });
    expect(buy).toHaveAttribute("href", "https://shop.example.com/linen-shirt");
    expect(buy).toHaveAttribute("target", "_blank");
    expect(buy).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("has no Buy link without a buyLink", () => {
    renderCard({ buyLink: null });
    expect(screen.queryByRole("link", { name: /^Buy/ })).not.toBeInTheDocument();
  });
});
