"use client";
import type { StreamEvent } from "@/lib/types";

const COLORS: Record<string, string> = {
  step_start: "bg-zinc-700",
  tool_call: "bg-indigo-600",
  tool_result: "bg-emerald-600",
  divergence: "bg-amber-600",
  failover: "bg-rose-600",
  incident_done: "bg-zinc-100 text-zinc-900",
};

export function Timeline({ events }: { events: StreamEvent[] }) {
  return (
    <div className="flex flex-wrap gap-1 rounded-md border border-zinc-800 bg-zinc-900/40 p-2 text-xs">
      {events.map((e, i) => (
        <span key={i} className={`rounded px-1.5 py-0.5 text-white/90 ${COLORS[e.type] ?? "bg-zinc-700"}`}>
          {e.type}
        </span>
      ))}
    </div>
  );
}
