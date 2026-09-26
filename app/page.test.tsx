import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Home from "./page";

describe("Home page", () => {
  it("shows the product name as the main heading", () => {
    render(<Home />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Mirror AI");
  });

  it("explains what virtual try-on does", () => {
    render(<Home />);
    expect(screen.getByText(/see how clothes look on you before you buy/i)).toBeInTheDocument();
  });

  it("has no leftover starter links", () => {
    render(<Home />);
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });
});
