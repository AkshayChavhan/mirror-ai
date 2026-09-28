import Link from "next/link";

/** Shown for an unknown share link, or one older than 24 hours (its try-on was deleted for privacy). */
export default function SharedTryOnNotFound() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">This try-on isn&apos;t available</h1>
      <p className="text-zinc-600 dark:text-zinc-400">
        The link may be wrong, or the try-on has expired: try-ons and their photos are deleted after 24 hours.
      </p>
      <Link href="/" className="self-start underline">
        Try Mirror AI yourself
      </Link>
    </main>
  );
}
