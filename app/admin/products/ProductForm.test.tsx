import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ProductForm from "./ProductForm";

const EDITED = {
  name: "Linen Shirt",
  category: "UPPER" as const,
  price: 29.99,
  description: "Summer shirt",
  buyLink: "https://shop.example.com/shirt",
  isActive: false,
  imageUrl: "https://res.cloudinary.com/demo/image/upload/shirt.png",
  modelUrl: null,
};

describe("ProductForm", () => {
  it("creating: empty fields, image required, visible by default", () => {
    render(<ProductForm action={vi.fn()} />);
    expect(screen.getByLabelText("Name")).toHaveValue("");
    expect(screen.getByLabelText("Garment image")).toBeRequired();
    expect(screen.getByLabelText("Garment image")).toHaveAccessibleDescription(/at least 512 × 512 pixels, up to 5 MB/); // task 68
    expect(screen.getByLabelText("Visible to shoppers")).toBeChecked();
    expect(screen.getByRole("button", { name: "Create product" })).toBeInTheDocument();
  });

  it("editing: fields prefilled, new image optional", () => {
    render(<ProductForm action={vi.fn()} product={EDITED} />);
    expect(screen.getByLabelText("Name")).toHaveValue("Linen Shirt");
    expect(screen.getByLabelText("Category")).toHaveValue("UPPER");
    expect(screen.getByLabelText("Price (optional)")).toHaveValue(29.99);
    expect(screen.getByLabelText("Replace garment image (optional)")).not.toBeRequired();
    expect(screen.getByLabelText("Visible to shoppers")).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeInTheDocument();
  });

  it("creating: an optional .glb 3D model field (task 67), with what it's for and its limit", () => {
    render(<ProductForm action={vi.fn()} />);
    const model = screen.getByLabelText("3D model (.glb, optional)");
    expect(model).toHaveAttribute("type", "file");
    expect(model).toHaveAttribute("name", "model");
    expect(model).toHaveAttribute("accept", ".glb,model/gltf-binary");
    expect(model).not.toBeRequired();
    expect(model).toHaveAccessibleDescription(/rigged to a Mixamo skeleton.*up to 5 MB/);
    expect(screen.queryByLabelText("Remove the 3D model")).not.toBeInTheDocument();
  });

  it("editing a garment WITH a 3D model: says so, offers Replace and Remove (unticked)", () => {
    const modelUrl = "https://res.cloudinary.com/demo/raw/upload/v1/mirror-ai/models/m1";
    render(<ProductForm action={vi.fn()} product={{ ...EDITED, modelUrl }} />);
    expect(screen.getByLabelText("Replace 3D model (.glb, optional)")).toHaveAccessibleDescription(/^This garment has a 3D model\./);
    const remove = screen.getByLabelText("Remove the 3D model");
    expect(remove).toHaveAttribute("name", "removeModel");
    expect(remove).not.toBeChecked();
  });

  it("editing a garment WITHOUT a 3D model: just the optional field, nothing to remove", () => {
    render(<ProductForm action={vi.fn()} product={EDITED} />);
    expect(screen.getByLabelText("3D model (.glb, optional)")).toBeInTheDocument();
    expect(screen.queryByLabelText("Remove the 3D model")).not.toBeInTheDocument();
  });

  it("shows the error the action returns", async () => {
    const action = vi.fn().mockResolvedValue({ error: "Please enter a product name." });
    const { container } = render(<ProductForm action={action} />);
    fireEvent.submit(container.querySelector("form")!);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Please enter a product name."));
    expect(action).toHaveBeenCalledWith({ error: null }, expect.any(FormData));
  });
});
