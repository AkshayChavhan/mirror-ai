"use client";

import type { Product } from "@prisma/client";
import { useActionState } from "react";
import type { ProductFormState } from "./actions";

type Props = {
  action: (prev: ProductFormState, formData: FormData) => Promise<ProductFormState>;
  /** Present when editing; absent when creating. */
  product?: Pick<Product, "name" | "category" | "price" | "description" | "buyLink" | "isActive" | "imageUrl" | "modelUrl">;
};

const INITIAL: ProductFormState = { error: null };

export default function ProductForm({ action, product }: Props) {
  const [state, formAction, pending] = useActionState(action, INITIAL);
  const editing = Boolean(product);

  return (
    <form action={formAction} className="mt-6 flex max-w-lg flex-col gap-4">
      <label className="flex flex-col gap-1">
        Name
        <input name="name" required maxLength={120} defaultValue={product?.name} className="rounded border px-3 py-2" />
      </label>

      <label className="flex flex-col gap-1">
        Category
        <select name="category" required defaultValue={product?.category ?? ""} className="rounded border px-3 py-2">
          <option value="" disabled>
            Choose a category
          </option>
          <option value="UPPER">Top</option>
          <option value="LOWER">Bottom</option>
          <option value="OVERALL">Dress</option>
        </select>
      </label>

      <div className="flex flex-col gap-1">
        <label htmlFor="product-image">{editing ? "Replace garment image (optional)" : "Garment image"}</label>
        <input
          id="product-image"
          name="image"
          type="file"
          accept="image/*"
          required={!editing}
          aria-describedby="product-image-hint"
          className="rounded border px-3 py-2"
        />
        <span id="product-image-hint" className="text-sm text-zinc-500">
          A clean garment photo on a plain background, up to 5 MB.
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="product-model">
          {product?.modelUrl ? "Replace 3D model (.glb, optional)" : "3D model (.glb, optional)"}
        </label>
        <input
          id="product-model"
          name="model"
          type="file"
          accept=".glb,model/gltf-binary"
          aria-describedby="product-model-hint"
          className="rounded border px-3 py-2"
        />
        <span id="product-model-hint" className="text-sm text-zinc-500">
          {product?.modelUrl ? "This garment has a 3D model. " : ""}
          For Live 3D: the garment rigged to a Mixamo skeleton, exported as glTF Binary, up to 5 MB. Without
          one, Live 3D uses a built-in shape.
        </span>
        {product?.modelUrl && (
          <label className="flex items-center gap-2">
            <input name="removeModel" type="checkbox" />
            Remove the 3D model
          </label>
        )}
      </div>

      <label className="flex flex-col gap-1">
        Price (optional)
        <input
          name="price"
          type="number"
          min="0"
          step="0.01"
          defaultValue={product?.price ?? ""}
          className="rounded border px-3 py-2"
        />
      </label>

      <label className="flex flex-col gap-1">
        Description (optional)
        <textarea
          name="description"
          maxLength={2000}
          defaultValue={product?.description ?? ""}
          className="rounded border px-3 py-2"
        />
      </label>

      <label className="flex flex-col gap-1">
        Buy link (optional)
        <input
          name="buyLink"
          type="url"
          placeholder="https://"
          defaultValue={product?.buyLink ?? ""}
          className="rounded border px-3 py-2"
        />
      </label>

      <label className="flex items-center gap-2">
        <input name="isActive" type="checkbox" defaultChecked={product?.isActive ?? true} />
        Visible to shoppers
      </label>

      {state.error && (
        <p role="alert" className="text-red-600">
          {state.error}
        </p>
      )}

      <button type="submit" disabled={pending} className="rounded bg-black px-4 py-2 text-white disabled:opacity-50">
        {pending ? "Saving…" : editing ? "Save changes" : "Create product"}
      </button>
    </form>
  );
}
