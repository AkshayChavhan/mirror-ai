import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { getProduct } from "@/lib/products";
import ProductForm from "../../ProductForm";
import { updateProductAction } from "../../actions";

export const metadata = { title: "Edit product · Admin · Mirror AI" };

export default async function EditProductPage({ params }: PageProps<"/admin/products/[id]/edit">) {
  await requireAdmin();
  const { id } = await params; // Next 16: params is a Promise
  const product = await getProduct(id);
  if (!product) notFound();

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-12">
      <Link href="/admin/products" className="text-sm text-zinc-500 underline">
        Back to products
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">Edit {product.name}</h1>
      <ProductForm action={updateProductAction.bind(null, id)} product={product} />
    </main>
  );
}
