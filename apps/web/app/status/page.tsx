import Link from "next/link";
import { listScenarios, type DemoScenario } from "@/lib/api";
import { OpsRow, severityTone } from "@/components/ops-board/row";

export const dynamic = "force-dynamic";

const TONE_COLOR = {
  ok: "var(--color-fg-dim)",
  warn: "var(--color-shadow-prov)",
  critical: "var(--color-danger)",
} as const;

export default async function StatusPage() {
  const scenarios = await listScenarios();
  const tally = scenarios.reduce(
    (acc, s) => {
      acc[severityTone(s.severity)] += 1;
      return acc;
    },
    { ok: 0, warn: 0, critical: 0 } as Record<"ok" | "warn" | "critical", number>,
  );

  return (
    <main className="flex min-h-screen flex-col bg-[var(--color-bg)] text-[var(--color-fg)]">
      <header className="flex items-center justify-between border-b border-[var(--color-border)] px-8 py-5">
        <Link href="/" className="font-mono-label text-[var(--color-fg-dim)] transition-colors hover:text-[var(--color-fg)]">
          argus
        </Link>
        <nav className="flex items-center gap-6">
          <Link href="/status" className="font-mono-label text-[var(--color-fg)]">
            status
          </Link>
          <Link href="/incidents" className="font-mono-label text-[var(--color-fg-dim)] transition-colors hover:text-[var(--color-fg)]">
            incidents
          </Link>
        </nav>
      </header>

      <section className="px-8 pt-12 pb-6">
        <div className="mx-auto max-w-[1320px]">
          <p className="font-mono-label text-[var(--color-fg-dim)]">argus / status</p>
          <h1 className="mt-3 font-display text-[clamp(34px,4vw,44px)] font-light leading-[1.02] tracking-[-0.02em] text-[var(--color-fg)]">
            observed surfaces
          </h1>
          <p className="mt-3 max-w-[60ch] text-[15px] font-light leading-[1.55] text-[var(--color-fg-muted)]">
            Six products under watch. Inspect the distressed surface, or page Argus to investigate.
          </p>
        </div>
      </section>

      <section className="flex-1 px-8 pb-16">
        <div className="mx-auto grid max-w-[1320px] grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="border-b border-[var(--color-border)]">
            {scenarios.map((s: DemoScenario) => (
              <OpsRow key={s.id} scenario={s} />
            ))}
          </div>

          <aside className="space-y-7">
            <div className="space-y-3">
              <p className="font-mono-label text-[var(--color-fg-dim)]">severity</p>
              <div className="space-y-2">
                <RollupLine tone="critical" count={tally.critical} label="critical" />
                <RollupLine tone="warn" count={tally.warn} label="degraded" />
                <RollupLine tone="ok" count={tally.ok} label="ok" />
              </div>
            </div>

            <div className="space-y-3 border-t border-[var(--color-border)] pt-7">
              <p className="font-mono-label text-[var(--color-fg-dim)]">legend</p>
              <ul className="space-y-1.5 font-mono-meta text-[var(--color-fg-muted)]">
                <li><span style={{ color: TONE_COLOR.ok }}>◯</span>  ok</li>
                <li><span style={{ color: TONE_COLOR.warn }}>◐</span>  degraded</li>
                <li><span style={{ color: TONE_COLOR.critical }}>●</span>  critical</li>
              </ul>
            </div>

            <div className="space-y-3 border-t border-[var(--color-border)] pt-7">
              <p className="font-mono-label text-[var(--color-fg-dim)]">past incidents</p>
              <Link
                href="/incidents"
                className="inline-flex items-baseline gap-1.5 text-[14px] font-light text-[var(--color-fg)] transition-colors hover:text-[var(--color-primary)]"
              >
                browse <span aria-hidden>→</span>
              </Link>
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}

function RollupLine({
  tone,
  count,
  label,
}: {
  tone: "ok" | "warn" | "critical";
  count: number;
  label: string;
}) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="font-mono-meta text-[var(--color-fg-muted)]">{label}</span>
      <span
        className="font-mono-meta tnum text-[16px]"
        style={{ color: TONE_COLOR[tone] }}
      >
        {count.toString().padStart(2, "0")}
      </span>
    </div>
  );
}
