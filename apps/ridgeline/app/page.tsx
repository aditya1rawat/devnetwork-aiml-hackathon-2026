import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto max-w-[900px] px-8 py-20">
      <h1 className="font-display text-[40px] font-light tracking-[-0.02em]">Ridgeline</h1>
      <p className="mt-4 text-[14px] text-[var(--color-fg-muted)]">Data pipeline platform.</p>
      <ul className="mt-8 space-y-2 text-[13px]">
        <li><Link href="/login" className="underline underline-offset-4">Sign In</Link></li>
        <li><Link href="/query" className="underline underline-offset-4">Query Studio</Link></li>
        <li><Link href="/jobs" className="underline underline-offset-4">Batch Jobs</Link></li>
      </ul>
    </main>
  );
}
