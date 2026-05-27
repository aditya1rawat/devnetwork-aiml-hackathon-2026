import Link from "next/link";
import type { DemoScenario } from "@/lib/api";
import { PageArgusButton } from "./page-argus-button";

type Tone = "ok" | "warn" | "critical";

export function severityTone(severity: DemoScenario["severity"]): Tone {
  if (severity === "sev1") return "critical";
  if (severity === "sev2") return "warn";
  return "ok";
}

const TONE_COLOR: Record<Tone, string> = {
  ok: "var(--color-fg-dim)",
  warn: "var(--color-shadow-prov)",
  critical: "var(--color-danger)",
};

const TONE_GLYPH: Record<Tone, string> = {
  ok: "◯",
  warn: "◐",
  critical: "●",
};

const TONE_LABEL: Record<Tone, string> = {
  ok: "ok",
  warn: "degraded",
  critical: "critical",
};

export function OpsRow({ scenario }: { scenario: DemoScenario }) {
  const tone = severityTone(scenario.severity);
  const color = TONE_COLOR[tone];

  return (
    <div className="group grid grid-cols-[28px_minmax(0,1fr)_auto] gap-x-5 gap-y-1 border-t border-[var(--color-border)] px-6 py-5 transition-colors hover:bg-[var(--color-surface)]/40">
      <div
        aria-hidden
        className="row-start-1 col-start-1 flex h-[22px] items-center justify-center text-[14px] leading-none"
        style={{ color }}
        title={TONE_LABEL[tone]}
      >
        {TONE_GLYPH[tone]}
      </div>

      <div className="row-start-1 col-start-2 flex flex-wrap items-baseline gap-x-2">
        <span className="font-serif-display text-[16px] italic text-[var(--color-fg-muted)]">
          {scenario.productLabel.toLowerCase()}
        </span>
        <span className="text-[var(--color-fg-dim)]">·</span>
        <span className="text-[16px] font-light text-[var(--color-fg)]">
          {scenario.title}
        </span>
      </div>

      <div className="row-start-1 col-start-3 flex items-baseline gap-2">
        <span
          className="font-mono-meta tnum text-[13px]"
          style={{ color }}
        >
          {scenario.metric.label} {scenario.metric.value}
        </span>
      </div>

      <div className="row-start-2 col-start-2 flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-mono-label text-[var(--color-fg-dim)]">
          {scenario.surfaceKey} · {scenario.rootCause}
        </span>
        <span className="font-mono-meta truncate text-[var(--color-fg-muted)]">
          {scenario.sampleLog}
        </span>
      </div>

      <div className="row-start-2 col-start-3 flex items-center gap-2">
        <Link
          href={`/status/${scenario.id}`}
          className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border-strong)] px-2.5 py-1 font-mono-label text-[var(--color-fg-muted)] transition-colors hover:border-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
        >
          inspect <span aria-hidden>→</span>
        </Link>
        <PageArgusButton scenario={scenario.id} />
      </div>
    </div>
  );
}
