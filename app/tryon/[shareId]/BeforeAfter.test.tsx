import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import BeforeAfter from "./BeforeAfter";

const BEFORE = "https://res.cloudinary.com/demo/image/upload/v1/mirror-ai/people/p.jpg";
const AFTER = "https://res.cloudinary.com/demo/image/upload/v1/mirror-ai/results/r.png";

describe("BeforeAfter", () => {
  function renderSlider() {
    render(<BeforeAfter beforeUrl={BEFORE} afterUrl={AFTER} productName="Linen Shirt" />);
  }

  it("shows the original photo and the result, straight from Cloudinary", () => {
    renderSlider();
    expect(screen.getByRole("img", { name: "Before: the original photo" })).toHaveAttribute("src", BEFORE);
    expect(screen.getByRole("img", { name: "After: wearing Linen Shirt" })).toHaveAttribute("src", AFTER);
  });

  it("starts halfway, with a labelled slider", () => {
    renderSlider();
    const slider = screen.getByRole("slider", { name: "Compare before and after" });
    expect(slider).toHaveValue("50");
    expect(slider).toHaveAttribute("aria-valuetext", "50% after");
    expect(screen.getByRole("img", { name: /after/i })).toHaveStyle({ clipPath: "inset(0 50% 0 0)" });
  });

  it("reveals more of the result as the slider moves", () => {
    renderSlider();
    const slider = screen.getByRole("slider", { name: "Compare before and after" });
    fireEvent.change(slider, { target: { value: "80" } });
    expect(slider).toHaveAttribute("aria-valuetext", "80% after");
    expect(screen.getByRole("img", { name: /after/i })).toHaveStyle({ clipPath: "inset(0 20% 0 0)" });
  });
});
