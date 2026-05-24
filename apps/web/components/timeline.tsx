"use client";
import { useMemo } from "react";
import type { StreamEvent, EventName } from "@/lib/types";

const COLOR: Record<EventName, string> = {
  step_start: "var(--color-fg-dim)",
  primary_step: "var(--color-primary)",
  shadow_step: "var(--color-shadow-prov)",
  tool_call: "var(--color-fg-muted)",
  tool_result: "var(--color-success)",
  divergence: "var(--color-warn)",
  failover: "var(--color-danger)",
  gateway_mode: "var(--color-warn)",
  incident_done: "var(--color-success)",
};

const LABEL: Record<EventName, string> = {
  step_start: "step",
  primary_step: "primary",
  shadow_step: "shadow",
  tool_call: "tool→",
  tool_result: "tool✓",
  divergence: "diverge",
  failover: "failover",
  gateway_mode: "gateway",
  incident_done: "done",
};

export function Timeline({ events }: { events: StreamEvent[] }) {
  const recent = useMemo(() => events.slice(-60), [events]);

  return (
    <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]/40">
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-3">
        <span className="font-mono-label text-[var(--color-fg-dim)]">timeline</span>
        <span className="font-mono-meta tnum text-[var(--color-fg-dim)]">{events.length} events</span>
      </div>
      <div className="flex h-[76px] items-center gap-[3px] overflow-x-auto px-5">
        {recent.length === 0 ? (
          <span className="font-light italic font-serif-display text-[15px] text-[var(--color-fg-dim)]">awaiting first event…</span>
        ) : (
          recent.map((e, i) => (
            <span
              key={i}
              title={`${LABEL[e.type]} — ${e.type}`}
              className="h-8 w-1.5 shrink-0 rounded-sm transition-transform hover:scale-y-110"
              style={{ background: COLOR[e.type] }}
            />
          ))
        )}
      </div>
    </section>
  );
}
