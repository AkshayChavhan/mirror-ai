import type { Product } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import { ProductError, listAllProducts } from "@/lib/products";

export const metadata = { title: "Products · Admin · Mirror AI" };

const CATEGORY_LABEL: Record<Product["category"], string> = {
  UPPER: "Top",
  LOWER: "Bottom",
  OVERALL: "Dress",
};

function formatPrice(price: number | null): string {
  return price === null ? "—" : `$${price.toFixed(2)}`;
}

/** Admin-only list of every product, including hidden ones. */
export default async function AdminProductsPage() {
  // Signed out → /sign-in; signed in but not admin → 404 (lib/auth.ts).
  await requireAdmin();

  let products: Product[];
  try {
    products = await listAllProducts();
  } catch (error) {
    const message = error instanceof ProductError ? error.message : "Something went wrong. Please try again.";
    return (
      <main className="mx-auto w-full max-w-4xl px-6 py-12">
        <h1 className="text-2xl font-semibold">Products</h1>
        <p role="alert" className="mt-6 text-red-600">
          {message}
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-12">
      <h1 className="text-2xl font-semibold">Products</h1>
      {products.length === 0 ? (
        <p className="mt-6 text-zinc-600">No products yet.</p>
      ) : (
        <table className="mt-6 w-full text-left text-sm">
          <thead className="border-b border-zinc-200 text-zinc-500">
            <tr>
              <th scope="col" className="py-2">Name</th>
              <th scope="col" className="py-2">Category</th>
              <th scope="col" className="py-2">Price</th>
              <th scope="col" className="py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr key={product.id} className="border-b border-zinc-100">
                <td className="py-2">{product.name}</td>
                <td className="py-2">{CATEGORY_LABEL[product.category]}</td>
                <td className="py-2">{formatPrice(product.price)}</td>
                <td className="py-2">{product.isActive ? "Visible" : "Hidden"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
