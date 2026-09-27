import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ProductForm from "./ProductForm";

describe("ProductForm", () => {
  it("creating: empty fields, image required, visible by default", () => {
    render(<ProductForm action={vi.fn()} />);
    expect(screen.getByLabelText("Name")).toHaveValue("");
    expect(screen.getByLabelText("Garment image")).toBeRequired();
    expect(screen.getByLabelText("Visible to shoppers")).toBeChecked();
    expect(screen.getByRole("button", { name: "Create product" })).toBeInTheDocument();
  });

  it("editing: fields prefilled, new image optional", () => {
    render(
      <ProductForm
        action={vi.fn()}
        product={{
          name: "Linen Shirt",
          category: "UPPER",
          price: 29.99,
          description: "Summer shirt",
          buyLink: "https://shop.example.com/shirt",
          isActive: false,
          imageUrl: "https://res.cloudinary.com/demo/image/upload/shirt.png",
        }}
      />,
    );
    expect(screen.getByLabelText("Name")).toHaveValue("Linen Shirt");
    expect(screen.getByLabelText("Category")).toHaveValue("UPPER");
    expect(screen.getByLabelText("Price (optional)")).toHaveValue(29.99);
    expect(screen.getByLabelText("Replace garment image (optional)")).not.toBeRequired();
    expect(screen.getByLabelText("Visible to shoppers")).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeInTheDocument();
  });

  it("shows the error the action returns", async () => {
    const action = vi.fn().mockResolvedValue({ error: "Please enter a product name." });
    const { container } = render(<ProductForm action={action} />);
    fireEvent.submit(container.querySelector("form")!);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Please enter a product name."));
    expect(action).toHaveBeenCalledWith({ error: null }, expect.any(FormData));
  });
});
