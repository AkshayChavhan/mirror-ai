import type { Product } from "@prisma/client";
import Image from "next/image";
import Link from "next/link";

const CATEGORY_LABEL: Record<Product["category"], string> = {
  UPPER: "Top",
  LOWER: "Bottom",
  OVERALL: "Dress",
};

type Props = {
  product: Pick<Product, "id" | "name" | "imageUrl" | "category" | "price" | "buyLink">;
};

/** One garment on the landing page: photo, name, category, price, and actions. */
export default function ProductCard({ product }: Props) {
  return (
    <li className="flex flex-col gap-3">
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
        <h3 className="font-medium">{product.name}</h3>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{CATEGORY_LABEL[product.category]}</p>
        {product.price !== null && (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">${product.price.toFixed(2)}</p>
        )}
      </div>
      <div className="flex items-center gap-4 text-sm">
        {/* Accessible names start with the visible text (WCAG 2.5.3), so voice control can match them. */}
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
      </div>
    </li>
  );
}
