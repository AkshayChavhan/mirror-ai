import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import ProductForm from "../ProductForm";
import { createProductAction } from "../actions";

export const metadata = { title: "New product · Admin · Mirror AI" };

export default async function NewProductPage() {
  await requireAdmin();
  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-12">
      <Link href="/admin/products" className="text-sm text-zinc-500 underline">
        Back to products
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">New product</h1>
      <ProductForm action={createProductAction} />
    </main>
  );
}
