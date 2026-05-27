import { ridgelineSurfaceUrl, type DemoScenario } from "@/lib/api";
import { PageArgusButton } from "./page-argus-button";

type Tone = "ok" | "warn" | "critical";

export function severityTone(severity: DemoScenario["severity"]): Tone {
  if (severity === "sev1") return "critical";
  if (severity === "sev2") return "warn";
  return "ok";
}

const TONE_COLOR: Record<Tone, string> = {
  ok: "var(--color-fg-dim)",
  warn: "var(--color-warn)",
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
  const surfaceUrl = ridgelineSurfaceUrl(scenario.id);
  const inspectClass =
    "inline-flex h-8 items-center justify-center border border-[var(--color-border-strong)] bg-transparent px-4 font-mono text-[10.5px] font-semibold uppercase tracking-[0.18em] text-[var(--color-fg)] transition-colors hover:border-[var(--color-fg)] hover:bg-[var(--color-surface)]";

  return (
    <div className="group grid grid-cols-[28px_minmax(0,1fr)_auto] gap-x-5 gap-y-1 border-t border-[var(--color-border)] px-6 py-5 transition-colors hover:bg-[var(--color-surface)]">
      <div
        aria-hidden
        className="row-start-1 col-start-1 flex h-[22px] items-center justify-center text-[18px] leading-none"
        style={{ color }}
        title={TONE_LABEL[tone]}
      >
        {TONE_GLYPH[tone]}
      </div>

      <div className="row-start-1 col-start-2 flex flex-wrap items-baseline gap-x-2">
        <span className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-fg-muted)]">
          {scenario.productLabel}
        </span>
        <span className="text-[var(--color-fg-dim)]">·</span>
        <span className="text-[16px] font-normal text-[var(--color-fg)] font-display">
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

      <div className="row-start-2 col-start-3 flex items-stretch">
        {surfaceUrl ? (
          <a href={surfaceUrl} className={inspectClass}>
            inspect <span aria-hidden className="ml-1.5">→</span>
          </a>
        ) : null}
        <PageArgusButton scenario={scenario.id} />
      </div>
    </div>
  );
}
