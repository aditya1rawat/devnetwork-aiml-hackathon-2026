import Link from "next/link";
import { ArgusNav } from "@/components/argus-nav";
import { DualCognitionVisual } from "@/components/dual-cognition-visual";

const GRID_BG: React.CSSProperties = {
  backgroundImage:
    "linear-gradient(to right, var(--color-border) 1px, transparent 1px), linear-gradient(to bottom, var(--color-border) 1px, transparent 1px)",
  backgroundSize: "64px 64px",
  backgroundPosition: "-1px -1px",
};

export default function HomePage() {
  return (
    <main className="relative flex min-h-screen flex-col bg-[var(--color-bg)] text-[var(--color-fg)]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-25"
        style={GRID_BG}
      />

      <div className="relative">
        <ArgusNav active={null} />
      </div>

      <section className="relative flex-1 px-7 pt-16 pb-10">
        <div className="mx-auto grid w-full max-w-[1320px] grid-cols-1 items-center gap-16 lg:grid-cols-[1.35fr_1fr]">
          <div className="space-y-8">
            <div className="flex items-center gap-3 text-[var(--color-fg-muted)]">
              <span aria-hidden className="inline-block h-px w-7 bg-[var(--color-fg-muted)]" />
              <span className="font-mono text-[11px] font-medium uppercase tracking-[0.22em]">
                Autonomous on-call SRE
              </span>
            </div>

            <h1 className="font-display text-[clamp(38px,5.2vw,66px)] font-extralight leading-[1.0] tracking-[-0.025em] text-[var(--color-fg)]">
              Two cognitions.
              <br />
              <span className="text-[var(--color-fg-muted)]">Zero context loss.</span>
              <br />
              <span className="relative inline-block text-[var(--color-fg)]">
                Survive the chaos.
                <span
                  aria-hidden
                  className="absolute inset-x-2 -bottom-1 h-[6px] bg-[var(--color-fg-dim)] opacity-60"
                />
              </span>
            </h1>

            <p className="max-w-[58ch] font-mono text-[15px] leading-[1.65] text-[var(--color-fg-muted)]">
              Highly-available web servers run on N machines. Argus brings the same idea to agents. Claude and Nemotron investigate every incident in lockstep through TrueFoundry&apos;s gateway. When one degrades, the other takes over with zero context loss.
            </p>

            <div className="flex flex-wrap items-stretch pt-2">
              <Link
                href="/dashboard"
                className="inline-flex h-11 cursor-pointer items-center justify-center bg-[var(--color-fg)] px-6 font-mono text-[12px] font-semibold uppercase tracking-[0.18em] text-[var(--color-bg)] transition-colors hover:bg-white"
              >
                Open dashboard <span aria-hidden className="ml-2.5">→</span>
              </Link>
              <Link
                href="/incidents"
                className="inline-flex h-11 cursor-pointer items-center justify-center border border-[var(--color-border-strong)] bg-transparent px-6 font-mono text-[12px] font-semibold uppercase tracking-[0.18em] text-[var(--color-fg)] transition-colors hover:border-[var(--color-fg)] hover:bg-[var(--color-surface)]"
              >
                Browse incidents <span aria-hidden className="ml-2.5">→</span>
              </Link>
            </div>
          </div>

          <div className="relative flex items-center justify-center lg:justify-end">
            <DualCognitionVisual />
          </div>
        </div>
      </section>

      <footer className="relative border-t border-[var(--color-border)]">
        <div className="mx-auto grid max-w-[1320px] grid-cols-2 gap-x-10 gap-y-7 px-7 py-10 md:grid-cols-4">
          <StatRow label="primary" value="Claude" detail="TrueFoundry Gateway" />
          <StatRow label="shadow" value="Nemotron" detail="Crusoe Inference" />
          <StatRow label="orchestrator" value="Hono" detail=":7200 · SSE" />
          <StatRow label="cluster" value="FastAPI" detail=":7100 · chaos" />
        </div>
      </footer>
    </main>
  );
}

function StatRow({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="flex items-baseline gap-4">
      <span className="font-display text-[36px] font-light leading-none tracking-[-0.02em] text-[var(--color-fg)]">
        {value}
      </span>
      <div className="flex min-w-0 flex-col gap-1">
        <span className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">
          {label}
        </span>
        <span className="truncate font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--color-fg-dim)]">
          {detail}
        </span>
      </div>
    </div>
  );
}
