"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { StreamEvent } from "@/lib/types";
import { parseStep } from "@/lib/parse-step";

type Role = "primary" | "shadow";
type State = "live" | "killed" | "promoted";

const ROLE_STYLE: Record<Role, { dot: string; accent: string; soft: string; tag: string }> = {
  primary: {
    dot: "var(--color-primary)",
    accent: "var(--color-primary)",
    soft: "var(--color-primary-soft)",
    tag: "primary",
  },
  shadow: {
    dot: "var(--color-shadow-prov)",
    accent: "var(--color-shadow-prov)",
    soft: "var(--color-shadow-soft)",
    tag: "shadow",
  },
};

export function ReasoningPane({
  role,
  steps,
  provider,
  state = "live",
  eventAtStep,
}: {
  role: Role;
  steps?: StreamEvent[];
  provider: string;
  state?: State;
  eventAtStep?: number;
}) {
  const safeSteps = steps ?? [];
  const style = ROLE_STYLE[role];
  const lastLatency = (safeSteps[safeSteps.length - 1]?.data as { latencyMs?: number })?.latencyMs;

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state === "killed") return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [safeSteps.length, state]);

  const stepIndices = useMemo(() => {
    const out: number[] = [];
    safeSteps.forEach((e, i) => {
      if ((e.type as string) !== "failover_marker") out.push(i);
    });
    return out;
  }, [safeSteps]);
  const lastStepIdx = stepIndices.length > 0 ? stepIndices[stepIndices.length - 1] : null;

  const [manuallyOpened, setManuallyOpened] = useState<Set<number>>(() => new Set());
  const [manuallyClosed, setManuallyClosed] = useState<Set<number>>(() => new Set());
  const [autoId, setAutoId] = useState<number | null>(null);

  useEffect(() => {
    if (lastStepIdx === null) return;
    setAutoId((prev) => (prev === lastStepIdx ? prev : lastStepIdx));
  }, [lastStepIdx]);

  const isExpanded = useCallback(
    (idx: number) => (manuallyOpened.has(idx) || idx === autoId) && !manuallyClosed.has(idx),
    [manuallyOpened, manuallyClosed, autoId],
  );

  const toggleCard = useCallback(
    (idx: number) => {
      const open = (manuallyOpened.has(idx) || idx === autoId) && !manuallyClosed.has(idx);
      if (open) {
        setManuallyOpened((s) => {
          if (!s.has(idx)) return s;
          const n = new Set(s);
          n.delete(idx);
          return n;
        });
        setManuallyClosed((s) => {
          const n = new Set(s);
          n.add(idx);
          return n;
        });
      } else {
        setManuallyClosed((s) => {
          if (!s.has(idx)) return s;
          const n = new Set(s);
          n.delete(idx);
          return n;
        });
        setManuallyOpened((s) => {
          const n = new Set(s);
          n.add(idx);
          return n;
        });
      }
    },
    [manuallyOpened, manuallyClosed, autoId],
  );

  const expandAll = useCallback(() => {
    setManuallyOpened(new Set(stepIndices));
    setManuallyClosed(new Set());
  }, [stepIndices]);

  const collapseAll = useCallback(() => {
    setManuallyOpened(new Set());
    setManuallyClosed(new Set(stepIndices));
  }, [stepIndices]);

  const anyExpanded = stepIndices.some((i) => isExpanded(i));

  const borderColor =
    state === "killed" ? "var(--color-danger)" :
    state === "promoted" ? "var(--color-warn)" :
    style.soft;
  const ringGlow =
    state === "killed" ? `0 0 0 1px ${borderColor}66, inset 0 0 80px -20px ${borderColor}88` :
    state === "promoted" ? `0 0 0 1px ${borderColor}55, 0 0 40px -10px ${borderColor}` :
    undefined;

  const tagText =
    state === "killed" ? "primary · killed" :
    state === "promoted" ? "shadow · promoted" :
    style.tag;
  const tagColor =
    state === "killed" ? "var(--color-danger)" :
    state === "promoted" ? "var(--color-warn)" :
    "var(--color-fg-dim)";

  return (
    <div
      className="relative flex h-full flex-col overflow-hidden rounded-xl border bg-[var(--color-surface)]/40 transition-all duration-500"
      style={{ borderColor, boxShadow: ringGlow }}
    >
      {state === "promoted" ? (
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1 animate-pulse" style={{ background: borderColor }} />
      ) : null}

      <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] px-5 py-4">
        <div className="flex items-baseline gap-3">
          <span
            className="inline-block h-2 w-2 translate-y-[1px] rounded-full"
            style={{ background: state === "killed" ? "var(--color-danger)" : state === "promoted" ? "var(--color-warn)" : style.dot }}
          />
          <span className="font-mono-label" style={{ color: tagColor }}>{tagText}</span>
          <span
            className="text-[17px] font-light tracking-tight"
            style={{
              color: state === "killed" ? "var(--color-fg-dim)" : "var(--color-fg)",
              textDecorationLine: state === "killed" ? "line-through" : "none",
              textDecorationColor: "var(--color-danger)",
              textDecorationThickness: state === "killed" ? "1.5px" : undefined,
            }}
          >
            {provider}
          </span>
        </div>
        <div className="flex items-center gap-2 font-mono-meta text-[var(--color-fg-dim)]">
          {lastLatency ? <span className="tnum">{lastLatency}ms</span> : null}
          {lastLatency ? <span>·</span> : null}
          <span className="tnum">{safeSteps.length} steps</span>
          {stepIndices.length > 1 ? (
            <>
              <span>·</span>
              <button
                type="button"
                onClick={anyExpanded ? collapseAll : expandAll}
                className="font-mono-meta text-[var(--color-fg-dim)] transition-colors hover:text-[var(--color-fg)]"
              >
                {anyExpanded ? "collapse all" : "expand all"}
              </button>
            </>
          ) : null}
        </div>
      </div>

      {state === "killed" ? <KilledBanner step={eventAtStep} /> : null}
      {state === "promoted" ? <PromotedBanner step={eventAtStep} provider={provider} /> : null}

      <div
        ref={scrollRef}
        className={`flex-1 overflow-auto px-4 py-4 transition-opacity duration-500 ${state === "killed" ? "opacity-55" : "opacity-100"}`}
      >
        {safeSteps.length === 0 ? (
          <Awaiting role={role} state={state} />
        ) : (
          <ol className="space-y-3">
            {safeSteps.map((e, i) => {
              if ((e.type as string) === "failover_marker") {
                const d = e.data as { step: number; kind: "failed" | "promoted"; from?: string; to?: string };
                return <FailoverMarkerCard key={i} step={d.step} kind={d.kind} from={d.from} to={d.to} />;
              }
              const d = e.data as { step?: number; text?: string; error?: string; latencyMs?: number };
              const isPostFailover = state === "promoted" && eventAtStep !== undefined && (d.step ?? -1) > eventAtStep;
              if (d.error) return <ErrorStep key={i} step={d.step ?? i} error={d.error} />;
              return (
                <StepCard
                  key={i}
                  step={d.step ?? i}
                  text={d.text ?? ""}
                  latency={d.latencyMs}
                  accent={style.accent}
                  postFailover={isPostFailover}
                  expanded={isExpanded(i)}
                  onToggle={() => toggleCard(i)}
                />
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}

function KilledBanner({ step }: { step?: number }) {
  return (
    <div className="flex items-center gap-3 border-b border-[var(--color-danger)]/35 bg-[var(--color-danger-soft)]/30 px-5 py-2.5">
      <span className="font-mono text-[10.5px] font-medium uppercase tracking-[0.22em] text-[var(--color-danger)]">
        terminated
      </span>
      <span className="font-light text-[13.5px] text-[var(--color-fg-muted)]">
        Primary cognition halted{step !== undefined ? ` at step ${String(step).padStart(2, "0")}` : ""}. No further reasoning.
      </span>
    </div>
  );
}

function PromotedBanner({ step, provider }: { step?: number; provider: string }) {
  return (
    <div className="flex items-center gap-3 border-b border-[var(--color-warn)]/40 bg-[var(--color-shadow-soft)]/25 px-5 py-2.5">
      <span className="font-mono text-[10.5px] font-medium uppercase tracking-[0.22em] text-[var(--color-warn)]">
        promoted
      </span>
      <span className="font-light text-[13.5px] text-[var(--color-fg)]">
        {provider} is now driving the investigation
        {step !== undefined ? <span className="text-[var(--color-fg-dim)]"> · from step {String(step).padStart(2, "0")}</span> : null}
      </span>
    </div>
  );
}

function Awaiting({ role, state }: { role: Role; state: State }) {
  if (state === "killed") {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="font-mono-label text-[var(--color-danger)]">no output</div>
          <p className="max-w-[28ch] font-light text-[14px] text-[var(--color-fg-muted)]">
            Primary did not produce any reasoning before failure.
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex h-full items-center justify-center">
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="font-mono-label text-[var(--color-fg-dim)]">awaiting</div>
        <p className="max-w-[28ch] font-light text-[15px] text-[var(--color-fg-muted)]">
          {role === "primary" ? "Primary cognition warming up." : "Shadow cognition standing by."}
        </p>
      </div>
    </div>
  );
}

function FailoverMarkerCard({ step, kind, from, to }: { step: number; kind: "failed" | "promoted"; from?: string; to?: string }) {
  const isFailed = kind === "failed";
  const accent = isFailed ? "var(--color-danger)" : "var(--color-warn)";
  const eyebrow = isFailed ? "primary failed" : "taking over";
  const body = isFailed
    ? `${from ?? "primary"} did not respond. Investigation handed off to ${to ?? "shadow"}.`
    : `${from ?? "primary"} unavailable. ${to ?? "shadow"} assumes primary role from here.`;

  return (
    <li
      className="relative rounded-lg border bg-[var(--color-bg)]/60"
      style={{ borderColor: accent + "59" }}
    >
      <header className="flex items-center justify-between gap-3 border-b px-4 py-2.5" style={{ borderColor: accent + "33" }}>
        <div className="flex items-baseline gap-3">
          <span className="font-mono-label text-[var(--color-fg-dim)] tnum">step {String(step).padStart(2, "0")}</span>
          <span
            className="rounded px-1.5 py-0.5 font-mono text-[11px] font-medium uppercase tracking-[0.12em]"
            style={{ background: accent + "1f", color: accent }}
          >
            {eyebrow}
          </span>
        </div>
        <span className="font-mono-meta text-[var(--color-fg-dim)]">↯ failover</span>
      </header>
      <div className="px-4 py-3">
        <p className="text-[13.5px] font-light leading-[1.5] text-[var(--color-fg-muted)]">{body}</p>
      </div>
    </li>
  );
}

function ErrorStep({ step, error }: { step: number; error: string }) {
  return (
    <li className="rounded-lg border border-[var(--color-danger)]/35 bg-[var(--color-danger-soft)]/25 px-3 py-2.5">
      <div className="font-mono-label text-[var(--color-danger)]">step {step} · error</div>
      <p className="mt-1 font-light text-[14px] text-[var(--color-fg)]">{error}</p>
    </li>
  );
}

function StepCard({
  step,
  text,
  latency,
  accent,
  postFailover,
  expanded,
  onToggle,
}: {
  step: number;
  text: string;
  latency?: number;
  accent: string;
  postFailover?: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const parsed = parseStep(text);
  const hasStructure = Boolean(parsed.action || parsed.rationale);
  const ringColor = postFailover ? "var(--color-warn)" : "var(--color-border)";

  const [showRaw, setShowRaw] = useState(false);
  useEffect(() => {
    if (!expanded) setShowRaw(false);
  }, [expanded]);

  const summaryLine = parsed.rationale ?? (hasStructure ? "" : parsed.raw);

  return (
    <li
      className="overflow-hidden rounded-lg border bg-[var(--color-bg)]/60 transition-colors"
      style={{ borderColor: ringColor }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="group flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-[var(--color-surface)]/40"
      >
        <span className="font-mono-label text-[var(--color-fg-dim)] tnum shrink-0">
          step {String(step).padStart(2, "0")}
        </span>
        {parsed.action ? (
          <span
            className="shrink-0 rounded px-1.5 py-0.5 font-mono text-[11px] font-medium tracking-[0.05em]"
            style={{ background: accent + "1f", color: accent }}
          >
            {parsed.action}
          </span>
        ) : null}
        {postFailover ? (
          <span className="shrink-0 font-mono text-[9.5px] font-medium uppercase tracking-[0.22em] text-[var(--color-warn)]">
            post-failover
          </span>
        ) : null}
        {!expanded && summaryLine ? (
          <span
            className={`min-w-0 flex-1 truncate ${hasStructure ? "font-light text-[13.5px] text-[var(--color-fg-muted)]" : "font-mono text-[12px] text-[var(--color-fg-muted)]"}`}
          >
            {summaryLine}
          </span>
        ) : (
          <span className="min-w-0 flex-1" />
        )}
        {latency ? (
          <span className="shrink-0 font-mono-meta text-[var(--color-fg-dim)] tnum">{latency}ms</span>
        ) : null}
        <span
          aria-hidden
          className="shrink-0 font-mono text-[11px] text-[var(--color-fg-dim)] transition-transform duration-200 group-hover:text-[var(--color-fg)]"
          style={{ transform: expanded ? "rotate(90deg)" : "rotate(0deg)" }}
        >
          ▸
        </span>
      </button>

      <div
        className="grid transition-[grid-template-rows] duration-[220ms]"
        style={{
          gridTemplateRows: expanded ? "1fr" : "0fr",
          transitionTimingFunction: "cubic-bezier(0.165, 0.84, 0.44, 1)",
        }}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="border-t border-[var(--color-border)]">
            {hasStructure ? (
              <div className="space-y-3.5 px-4 py-3.5">
                {parsed.action !== "report" && parsed.args && Object.keys(parsed.args).length > 0 ? (
                  <ArgsLine args={parsed.args} />
                ) : null}
                {parsed.rationale ? (
                  <p className="text-[14.5px] font-light leading-[1.55] text-[var(--color-fg)]">{parsed.rationale}</p>
                ) : null}
                {parsed.hypotheses && parsed.hypotheses.length > 0 ? (
                  <ul className="flex flex-wrap gap-1.5">
                    {parsed.hypotheses.map((h, i) => (
                      <li
                        key={i}
                        className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]/60 px-2 py-1 text-[12.5px] font-light text-[var(--color-fg-muted)]"
                      >
                        {h}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <div className="border-t border-[var(--color-border)] pt-2.5">
                  <button
                    type="button"
                    onClick={() => setShowRaw((v) => !v)}
                    aria-expanded={showRaw}
                    className="flex items-center gap-1.5 font-mono-meta text-[var(--color-fg-dim)] transition-colors hover:text-[var(--color-fg)]"
                  >
                    <span
                      aria-hidden
                      className="inline-block transition-transform duration-200"
                      style={{ transform: showRaw ? "rotate(90deg)" : "rotate(0deg)" }}
                    >
                      ▸
                    </span>
                    {showRaw ? "hide raw payload" : "view raw payload"}
                  </button>
                  <div
                    className="mt-2 grid transition-[grid-template-rows] duration-[220ms]"
                    style={{
                      gridTemplateRows: showRaw ? "1fr" : "0fr",
                      transitionTimingFunction: "cubic-bezier(0.165, 0.84, 0.44, 1)",
                    }}
                  >
                    <div className="min-h-0 overflow-hidden">
                      <pre className="max-h-[280px] overflow-auto rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]/60 px-3 py-2.5 font-mono text-[11.5px] leading-[1.5] text-[var(--color-fg-muted)] whitespace-pre-wrap break-all">
                        {formatRaw(parsed.raw)}
                      </pre>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <pre className="overflow-auto px-4 py-3 font-mono text-[12px] text-[var(--color-fg-muted)] whitespace-pre-wrap break-all">
                {parsed.raw}
              </pre>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

function formatRaw(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

function ArgsLine({ args }: { args: Record<string, unknown> }) {
  const entries = Object.entries(args).slice(0, 4);
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[12px]">
      {entries.map(([k, v]) => (
        <span key={k} className="text-[var(--color-fg-dim)]">
          {k}=<span className="text-[var(--color-fg)]">{String(v).slice(0, 40)}</span>
        </span>
      ))}
    </div>
  );
}
