import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listRecentTryOns, type RecentTryOn } from "@/lib/tryons";
import { timeAgo } from "./timeAgo";

export const metadata: Metadata = { title: "Your try-ons · Mirror AI" };

/** What to show instead of the result image. Exhaustive: TypeScript flags a missing status. */
function statusText(tryOn: RecentTryOn): string {
  switch (tryOn.status) {
    case "PENDING":
      return "Waiting to start…";
    case "PROCESSING":
      return "Creating your try-on…";
    case "FAILED":
      return tryOn.errorMessage ?? "This try-on didn't work.";
    case "DONE":
      return "Your try-on is ready."; // only if a DONE row somehow has no result image
  }
}

function TryOnItem({ tryOn, now }: { tryOn: RecentTryOn; now: Date }) {
  const { status, product } = tryOn;
  return (
    <li className="flex flex-col gap-2">
      {status === "DONE" && tryOn.resultUrl ? (
        <Image
          src={tryOn.resultUrl}
          alt={`You wearing ${product.name}`}
          width={384}
          height={512}
          // Straight from Cloudinary: Next's optimizer would keep a cached copy it can't delete, and the
          // user's photo must be gone after 24 h (docs/project-plan.md, "Privacy").
          unoptimized
          className="aspect-[3/4] w-full rounded object-cover"
        />
      ) : (
        <div className="flex aspect-[3/4] w-full items-center justify-center rounded bg-zinc-100 p-4 text-center text-sm text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
          {statusText(tryOn)}
        </div>
      )}
      <h2 className="font-medium">{product.name}</h2>
      <time dateTime={tryOn.createdAt.toISOString()} className="text-sm text-zinc-600 dark:text-zinc-400">
        {timeAgo(tryOn.createdAt, now)}
      </time>
    </li>
  );
}

/** The signed-in user's try-ons from the last 24 h (docs/project-plan.md, "Pages and flow"). */
export default async function HistoryPage() {
  const userId = await requireUser(); // first: signed-out visitors go to sign-in before any data is read

  let tryOns: RecentTryOn[] = [];
  let error: string | null = null;
  try {
    tryOns = await listRecentTryOns(userId);
  } catch {
    // lib/tryons logs database errors; show a message that fits this page.
    error = "We couldn't load your try-ons. Please try again.";
  }
  const now = new Date();

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-6 py-16">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Your try-ons</h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          Try-ons from the last 24 hours. After that, they and your photos are deleted.
        </p>
      </div>

      <section aria-label="Try-ons">
        {error ? (
          <p role="alert" className="text-red-600 dark:text-red-400">
            {error}
          </p>
        ) : tryOns.length === 0 ? (
          <p className="text-zinc-600 dark:text-zinc-400">
            No try-ons in the last 24 hours.{" "}
            <Link href="/tryon" className="underline">
              Try something on
            </Link>
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
            {tryOns.map((tryOn) => (
              <TryOnItem key={tryOn.id} tryOn={tryOn} now={now} />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
