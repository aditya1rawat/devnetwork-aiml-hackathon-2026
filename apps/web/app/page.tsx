import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-100">
      <div className="max-w-2xl space-y-6 p-8">
        <h1 className="text-5xl font-bold tracking-tight">Argus</h1>
        <p className="text-xl text-zinc-400">
          Two cognitions. Zero context loss. Survive the chaos.
        </p>
        <div className="flex gap-3">
          <Link
            href="/incident/demo-worker-oom"
            className="rounded-md bg-zinc-100 px-4 py-2 font-medium text-zinc-900 hover:bg-white"
          >
            Run demo: worker OOM
          </Link>
        </div>
      </div>
    </main>
  );
}
