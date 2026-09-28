import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { getAnonymousId } from "@/lib/anonymous-id";
import { WishlistError, listWishlist, type WishlistEntry, type WishlistOwner } from "@/lib/wishlist";
import RemoveButton from "./RemoveButton";

export const metadata: Metadata = { title: "Wishlist · Mirror AI" };

/** Whose wishlist to show: the signed-in user, else the anonymous visitor (read-only: no cookie is created). */
async function currentOwner(): Promise<WishlistOwner | null> {
  const { userId } = await auth();
  if (userId) return { userId };
  const anonymousId = await getAnonymousId();
  return anonymousId ? { anonymousId } : null;
}

/** Saved garments (docs/project-plan.md, "Pages and flow": public, signed out or in). */
export default async function WishlistPage() {
  let entries: WishlistEntry[] = [];
  let error: string | null = null;
  try {
    const owner = await currentOwner();
    if (owner) entries = await listWishlist(owner); // no owner yet: nothing saved, no database call
  } catch (err) {
    unstable_rethrow(err); // Next's own control-flow errors (e.g. from cookies()) must reach Next, not this catch
    // lib/wishlist already logged database errors; log anything else (e.g. Clerk failing) here.
    if (!(err instanceof WishlistError)) console.error("[wishlist page] Unexpected error:", err);
    error = "We couldn't load your wishlist. Please try again.";
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Wishlist</h1>

      <section aria-label="Saved garments">
        {error ? (
          <p role="alert" className="text-red-600 dark:text-red-400">
            {error}
          </p>
        ) : entries.length === 0 ? (
          <p className="text-zinc-600 dark:text-zinc-400">
            Your wishlist is empty.{" "}
            <Link href="/" className="underline">
              Browse garments
            </Link>
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
            {entries.map(({ id, product }) => (
              <li key={id} className="flex flex-col gap-3">
                <div className="relative aspect-[3/4] overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-900">
                  <Image
                    src={product.imageUrl}
                    alt={product.name}
                    fill
                    sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
                    className="object-contain"
                  />
                </div>
                <div>
                  <h2 className="font-medium">{product.name}</h2>
                  {product.price !== null && (
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">${product.price.toFixed(2)}</p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-4 text-sm">
                  <Link
                    href={`/tryon?product=${product.id}`}
                    aria-label={`Try it on: ${product.name}`}
                    className="rounded bg-black px-3 py-1.5 text-white dark:bg-white dark:text-black"
                  >
                    Try it on
                  </Link>
                  {product.buyLink && (
                    <a
                      href={product.buyLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Buy: ${product.name} (opens in a new tab)`}
                      className="underline"
                    >
                      Buy
                    </a>
                  )}
                  <RemoveButton itemId={id} name={product.name} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
