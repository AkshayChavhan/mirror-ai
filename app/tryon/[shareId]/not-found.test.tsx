import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import SharedTryOnNotFound from "./not-found";

describe("/tryon/[shareId] not found", () => {
  it("explains that try-ons expire after 24 hours, with a way to try it yourself", () => {
    render(<SharedTryOnNotFound />);
    expect(screen.getByRole("heading", { level: 1, name: "This try-on isn't available" })).toBeInTheDocument();
    expect(screen.getByText(/deleted after 24 hours/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Try Mirror AI yourself" })).toHaveAttribute("href", "/");
  });
});
