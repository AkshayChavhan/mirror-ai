import type { Product } from "@prisma/client";
import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listActiveProducts } from "@/lib/products";
import TryOnStudio, { type StudioProduct } from "./TryOnStudio";

export const metadata: Metadata = { title: "Try it on · Mirror AI" };

type Props = { searchParams: Promise<{ [key: string]: string | string[] | undefined }> };

/** The try-on studio (docs/project-plan.md, "Pages and flow": signed-in). ?product=<id> preselects a garment. */
export default async function TryOnPage({ searchParams }: Props) {
  await requireUser(); // first: signed-out visitors go to sign-in before any data is read

  const { product: wanted, tryon } = await searchParams;
  // ?tryon=<id>: a try-on already started, so a refresh keeps the loading screen (task 43). Only an id-shaped
  // value is passed on; the status endpoint still checks it's this user's.
  const initialTryOnId = typeof tryon === "string" && /^[a-f0-9]{24}$/i.test(tryon) ? tryon : null;
  let products: Product[] = [];
  let error: string | null = null;
  try {
    products = await listActiveProducts();
  } catch {
    // lib/products logs database errors; show a message that fits this page.
    error = "We couldn't load the garments. Please try again.";
  }

  // Only what the browser needs: id, name, image, and category for Live 3D's template (never prices or links).
  const studioProducts: StudioProduct[] = products.map(({ id, name, imageUrl, category }) => ({ id, name, imageUrl, category }));
  const initialProductId =
    typeof wanted === "string" && studioProducts.some((p) => p.id === wanted) ? wanted : studioProducts[0]?.id;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Try it on</h1>
      {error ? (
        <p role="alert" className="text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : !initialProductId ? (
        <p className="text-zinc-600 dark:text-zinc-400">
          There are no garments to try on yet.{" "}
          <Link href="/" className="underline">
            Back to the home page
          </Link>
        </p>
      ) : (
        <TryOnStudio products={studioProducts} initialProductId={initialProductId} initialTryOnId={initialTryOnId} />
      )}
    </main>
  );
}
