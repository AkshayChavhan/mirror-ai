// Temporary home page until the project plan (task 16) defines the real one.
export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-6 px-6 py-24">
      <h1 className="text-4xl font-semibold tracking-tight">Mirror AI</h1>
      <p className="text-lg leading-8 text-zinc-600 dark:text-zinc-400">
        See how clothes look on you before you buy. Upload a photo of yourself
        and a garment, and Mirror AI shows you wearing it: tops, bottoms, and
        dresses.
      </p>
      <p className="text-base text-zinc-500">Virtual try-on is coming soon.</p>
    </main>
  );
}
