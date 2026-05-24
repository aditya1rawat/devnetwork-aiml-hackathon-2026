"use client";
import Link from "next/link";
import { useEffect, useMemo } from "react";
import { useSSE } from "@/lib/sse";
import { startIncident, streamUrl } from "@/lib/api";
import { SplitStream } from "@/components/split-stream";
import { ChaosPanel } from "@/components/chaos-panel";
import { Timeline } from "@/components/timeline";
import { FailoverBanner } from "@/components/failover-banner";
import { FinalReport } from "@/components/final-report";
import { AgreementMeter } from "@/components/agreement-meter";

export function IncidentClient({ id }: { id: string }) {
  const events = useSSE(streamUrl(id));

  useEffect(() => {
    startIncident(id).catch(() => {});
  }, [id]);

  const {
    leftProvider,
    rightProvider,
    leftSteps,
    rightSteps,
    failedOver,
    failoverStepNum,
    status,
    gatewayMode,
    stepCount,
  } = useMemo(() => {
    const firstStepStart = events.find((e) => e.type === "step_start");
    const firstData = firstStepStart?.data as { primary?: string; shadow?: string } | undefined;

    const failoverIdx = events.findIndex((e) => e.type === "failover");
    const failoverEvt = failoverIdx >= 0 ? events[failoverIdx] : null;
    const failoverData = failoverEvt?.data as { from?: string; to?: string } | undefined;

    const leftProvider = firstData?.primary ?? failoverData?.from ?? "claude";
    const rightProvider: string | null = firstData?.shadow ?? failoverData?.to ?? "nemotron";

    const failedOver = failoverIdx >= 0;
    const failoverStepNum = failedOver
      ? Math.max(
          0,
          events.slice(0, failoverIdx).filter((e) => e.type === "step_start").length - 1,
        )
      : undefined;

    const buildPaneSteps = (provider: string) => {
      const out: typeof events = [];
      let currentStep = -1;
      for (const e of events) {
        if (e.type === "step_start") {
          currentStep = (e.data as { step?: number }).step ?? currentStep + 1;
        } else if (
          (e.type === "primary_step" || e.type === "shadow_step") &&
          (e.data as { provider?: string }).provider === provider
        ) {
          out.push(e);
        } else if (e.type === "failover") {
          const d = e.data as { from?: string; to?: string };
          if (d.from === provider) {
            out.push({
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              type: "failover_marker" as any,
              data: { step: currentStep, kind: "failed", from: d.from, to: d.to },
            });
          } else if (d.to === provider) {
            out.push({
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              type: "failover_marker" as any,
              data: { step: currentStep, kind: "promoted", from: d.from, to: d.to },
            });
          }
        }
      }
      return out;
    };
    const leftSteps = buildPaneSteps(leftProvider);
    const rightSteps = buildPaneSteps(rightProvider);

    const lastTerminalIdx = events.findLastIndex((e) => e.type === "incident_done");
    const lastStepIdx = events.findLastIndex((e) => e.type === "step_start");
    const isDone = lastTerminalIdx >= 0 && lastTerminalIdx > lastStepIdx;

    const status: "running" | "failed_over" | "done" = isDone
      ? "done"
      : failedOver
        ? "failed_over"
        : "running";

    const gatewayMode =
      (events.findLast((e) => e.type === "gateway_mode")?.data as { mode?: string } | undefined)?.mode ??
      "gateway";
    const stepCount = events.filter((e) => e.type === "step_start").length;

    return {
      leftProvider,
      rightProvider,
      leftSteps,
      rightSteps,
      failedOver,
      failoverStepNum,
      status,
      gatewayMode,
      stepCount,
    };
  }, [events]);

  return (
    <main className="min-h-screen bg-[var(--color-bg)] text-[var(--color-fg)]">
      <Topbar id={id} status={status} gatewayMode={gatewayMode} stepCount={stepCount} />

      <div className="mx-auto w-full max-w-[1400px] px-6 py-6 space-y-6">
        <FailoverBanner events={events} />

        <section className="grid grid-cols-[1fr_220px] gap-4">
          <Timeline events={events} />
          <AgreementMeter events={events} shadowPromoted={failedOver} />
        </section>

        <SplitStream
          leftSteps={leftSteps}
          rightSteps={rightSteps}
          leftProvider={leftProvider}
          rightProvider={rightProvider}
          failedOver={failedOver}
          failoverStepNum={failoverStepNum}
        />

        <ChaosPanel />

        <FinalReport events={events} />
      </div>
    </main>
  );
}

function Topbar({ id, status, gatewayMode, stepCount }: { id: string; status: "running" | "failed_over" | "done"; gatewayMode: string; stepCount: number }) {
  const statusLabel = status === "done" ? "resolved" : status === "failed_over" ? "failed over" : "investigating";
  const statusColor =
    status === "done" ? "var(--color-success)" : status === "failed_over" ? "var(--color-warn)" : "var(--color-primary)";
  return (
    <header className="sticky top-0 z-30 border-b border-[var(--color-border)] bg-[var(--color-bg)]/85 backdrop-blur supports-[backdrop-filter]:bg-[var(--color-bg)]/70">
      <div className="mx-auto flex w-full max-w-[1400px] items-center justify-between gap-6 px-6 py-3.5">
        <div className="flex items-baseline gap-5">
          <Link href="/" className="font-mono-label text-[var(--color-fg-dim)] transition-colors hover:text-[var(--color-fg)]">
            argus
          </Link>
          <Link href="/incidents" className="font-mono-meta text-[var(--color-fg-dim)] transition-colors hover:text-[var(--color-fg)]">
            ← incidents
          </Link>
          <h1 className="flex items-baseline gap-2 leading-none">
            <span className="font-mono-meta text-[var(--color-fg-dim)]">incident</span>
            <span className="font-mono text-[15px] tracking-tight text-[var(--color-fg)]">{id}</span>
          </h1>
        </div>
        <div className="flex items-center gap-2.5">
          <Pill label="status" value={statusLabel} valueColor={statusColor} pulse={status === "running"} />
          <Pill label="step" value={String(stepCount)} />
          <Pill label="gateway" value={gatewayMode} valueColor={gatewayMode === "direct" ? "var(--color-warn)" : undefined} />
        </div>
      </div>
    </header>
  );
}

function Pill({ label, value, valueColor, pulse }: { label: string; value: string; valueColor?: string; pulse?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)]/60 px-2.5 py-1">
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-fg-dim)]">{label}</span>
      <span className="flex items-center gap-1.5 font-mono text-[12px] tnum text-[var(--color-fg)]" style={valueColor ? { color: valueColor } : undefined}>
        {pulse ? (
          <span className="relative inline-flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ background: valueColor }} />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ background: valueColor }} />
          </span>
        ) : null}
        {value}
      </span>
    </span>
  );
}
