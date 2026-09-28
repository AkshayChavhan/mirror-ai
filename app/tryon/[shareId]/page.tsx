import type { Metadata } from "next";
import Link from "next/link";
import { notFound, unstable_rethrow } from "next/navigation";
import { downloadUrl } from "@/lib/cloudinary";
import { getSharedTryOn, type SharedTryOn } from "@/lib/tryons";
import BeforeAfter from "./BeforeAfter";

// Public by link (decided 2026-09-26, for WhatsApp sharing). The link's token is the random shareId
// (task 56); an ObjectId or anything else simply isn't found.

export const metadata: Metadata = {
  title: "A Mirror AI try-on",
  robots: { index: false, follow: false, noimageindex: true }, // personal: keep out of search engines
  referrer: "no-referrer", // don't send this page's private link to other sites (e.g. Cloudinary)
};

type Props = { params: Promise<{ shareId: string }> };

export default async function SharedTryOnPage({ params }: Props) {
  const { shareId } = await params;

  let tryOn: SharedTryOn | null = null;
  let error: string | null = null;
  try {
    tryOn = await getSharedTryOn(shareId);
  } catch (err) {
    unstable_rethrow(err);
    // lib/tryons logs database errors; show a message that fits this page.
    error = "We couldn't load this try-on. Please try again.";
  }
  if (!error && !tryOn) notFound(); // unknown, or older than 24 h (deleted for privacy)

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">
        {tryOn ? `Trying on: ${tryOn.product.name}` : "A Mirror AI try-on"}
      </h1>

      {error ? (
        <p role="alert" className="text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : tryOn && tryOn.status === "DONE" && tryOn.resultUrl ? (
        <>
          <BeforeAfter beforeUrl={tryOn.personUrl} afterUrl={tryOn.resultUrl} productName={tryOn.product.name} />
          <a
            href={downloadUrl(tryOn.resultUrl) ?? tryOn.resultUrl}
            download
            className="self-start rounded bg-black px-5 py-3 text-white dark:bg-white dark:text-black"
          >
            Download the result
          </a>
        </>
      ) : tryOn && tryOn.status === "FAILED" ? (
        <p className="text-zinc-600 dark:text-zinc-400">This try-on didn&apos;t work.</p>
      ) : (
        <p className="text-zinc-600 dark:text-zinc-400">This try-on is still being created. Check back in a minute.</p>
      )}

      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Try-ons and their photos are deleted after 24 hours.{" "}
        <Link href="/" className="underline">
          Try Mirror AI yourself
        </Link>
      </p>
    </main>
  );
}
