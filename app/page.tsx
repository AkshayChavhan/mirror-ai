import type { Product } from "@prisma/client";
import Link from "next/link";
import { connection } from "next/server";
import { ProductError, listActiveProducts } from "@/lib/products";
import ProductCard from "./ProductCard";

/** Public landing page: what Mirror AI does, plus the active products to try on. */
export default async function Home() {
  // Render per request, not at build time: products change, and the build has no database.
  await connection();

  let products: Product[] = [];
  let error: string | null = null;
  try {
    products = await listActiveProducts();
  } catch (e) {
    error = e instanceof ProductError ? e.message : "Something went wrong. Please try again.";
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 px-6 py-16">
      <section className="flex max-w-2xl flex-col gap-4">
        <h1 className="text-4xl font-semibold tracking-tight">Mirror AI</h1>
        <p className="text-lg leading-8 text-zinc-600 dark:text-zinc-400">
          See how clothes look on you before you buy. Pick a garment, take or upload a photo, and Mirror AI
          shows you wearing it.
        </p>
        <div>
          <Link href="/tryon" className="inline-block rounded bg-black px-5 py-3 text-white dark:bg-white dark:text-black">
            Try it on
          </Link>
        </div>
      </section>

      <section aria-labelledby="garments-heading" className="flex flex-col gap-6">
        <h2 id="garments-heading" className="text-xl font-medium">
          Garments
        </h2>
        {error ? (
          <p role="alert" className="text-red-600 dark:text-red-400">
            {error}
          </p>
        ) : products.length === 0 ? (
          <p className="text-zinc-600 dark:text-zinc-400">New garments are coming soon.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
