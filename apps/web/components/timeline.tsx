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
  provider_state: "var(--color-danger)",
  kb_lookup_started: "var(--color-shadow-prov)",
  kb_lookup_result: "var(--color-shadow-prov)",
  kb_ingest_queued: "var(--color-success)",
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
  provider_state: "provider",
  kb_lookup_started: "kb?",
  kb_lookup_result: "kb✓",
  kb_ingest_queued: "kb+",
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
            <div
              key={i}
              className="group/bar flex h-full shrink-0 items-center"
              title={e.type}
            >
              <div
                className="flex h-8 w-[9px] items-center justify-center overflow-hidden rounded-sm transition-[width,height,padding] duration-200 ease-out group-hover/bar:h-10 group-hover/bar:w-[88px] group-hover/bar:px-2"
                style={{ background: COLOR[e.type] }}
              >
                <span
                  className="whitespace-nowrap font-mono text-[10.5px] font-medium tracking-tight opacity-0 transition-opacity duration-150 delay-75 group-hover/bar:opacity-100"
                  style={{ color: "var(--color-bg)" }}
                >
                  {LABEL[e.type]}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
