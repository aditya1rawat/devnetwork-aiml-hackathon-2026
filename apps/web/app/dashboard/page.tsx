import Link from "next/link";
import { listScenarios, type DemoScenario } from "@/lib/api";
import { OpsRow, severityTone } from "@/components/ops-board/row";
import { ArgusNav } from "@/components/argus-nav";

export const dynamic = "force-dynamic";

const TONE_COLOR = {
  ok: "var(--color-fg-dim)",
  warn: "var(--color-warn)",
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
      <ArgusNav active="dashboard" />

      <section className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="flex h-7 items-center gap-3 px-7 font-mono text-[10.5px] font-medium uppercase tracking-[0.14em] text-[var(--color-fg-muted)]">
          <span
            aria-hidden
            className="inline-block h-2 w-2"
            style={{
              background: tally.critical > 0 ? "var(--color-danger)" : tally.warn > 0 ? "var(--color-warn)" : "var(--color-fg-dim)",
              boxShadow: tally.critical > 0
                ? "0 0 0 1px color-mix(in oklch, var(--color-danger) 60%, transparent)"
                : tally.warn > 0
                ? "0 0 0 1px color-mix(in oklch, var(--color-warn) 60%, transparent)"
                : undefined,
            }}
          />
          <span className="text-[var(--color-fg)]">STATUS:&nbsp;{tally.critical > 0 ? "DEGRADED" : tally.warn > 0 ? "WARN" : "OK"}</span>
          <span className="text-[var(--color-fg-dim)]">·</span>
          <span className="text-[var(--color-fg)]">{scenarios.length} OBSERVED SURFACES</span>
          <span className="ml-auto text-[var(--color-fg-dim)]">REGION&nbsp;·&nbsp;US-EAST-2</span>
        </div>
      </section>

      <section className="px-7 pt-12 pb-6">
        <div className="mx-auto max-w-[1320px]">
          <p className="font-mono-label text-[var(--color-fg-dim)]">argus / dashboard</p>
          <h1 className="mt-3 text-[clamp(34px,4vw,44px)] font-light leading-[1.02] tracking-[-0.02em] text-[var(--color-fg)] font-display">
            Observed surfaces
          </h1>
          <p className="mt-3 max-w-[60ch] text-[14px] font-normal leading-[1.55] text-[var(--color-fg-muted)] font-mono">
            Six products under watch. Inspect the distressed surface, or page Argus to investigate.
          </p>
        </div>
      </section>

      <section className="flex-1 px-7 pb-16">
        <div className="mx-auto grid max-w-[1320px] grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="border-b border-[var(--color-border)]">
            {scenarios.map((s: DemoScenario) => (
              <OpsRow key={s.id} scenario={s} />
            ))}
          </div>

          <aside className="space-y-7">
            <div className="space-y-3">
              <p className="font-mono-label text-[var(--color-fg-dim)]">Severity</p>
              <div className="space-y-2">
                <RollupLine tone="critical" count={tally.critical} label="critical" />
                <RollupLine tone="warn" count={tally.warn} label="degraded" />
                <RollupLine tone="ok" count={tally.ok} label="ok" />
              </div>
            </div>

            <div className="space-y-3 border-t border-[var(--color-border)] pt-7">
              <p className="font-mono-label text-[var(--color-fg-dim)]">Legend</p>
              <ul className="space-y-2 font-mono-meta text-[var(--color-fg-muted)]">
                <li className="flex items-center gap-2.5"><span className="inline-flex w-4 justify-center text-[15px] leading-none" style={{ color: TONE_COLOR.ok }}>◯</span> ok</li>
                <li className="flex items-center gap-2.5"><span className="inline-flex w-4 justify-center text-[15px] leading-none" style={{ color: TONE_COLOR.warn }}>◐</span> degraded</li>
                <li className="flex items-center gap-2.5"><span className="inline-flex w-4 justify-center text-[15px] leading-none" style={{ color: TONE_COLOR.critical }}>●</span> critical</li>
              </ul>
            </div>

            <div className="space-y-3 border-t border-[var(--color-border)] pt-7">
              <p className="font-mono-label text-[var(--color-fg-dim)]">Past incidents</p>
              <Link
                href="/incidents"
                className="inline-flex items-baseline gap-1.5 font-mono text-[12px] uppercase tracking-[0.16em] text-[var(--color-fg)] transition-colors hover:text-[var(--color-fg-muted)]"
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
        className="font-mono tnum text-[16px] font-medium"
        style={{ color: TONE_COLOR[tone] }}
      >
        {count.toString().padStart(2, "0")}
      </span>
    </div>
  );
}
