"use client";
import { useMemo } from "react";
import type { StreamEvent } from "@/lib/types";

export function AgreementMeter({ events }: { events: StreamEvent[] }) {
  const score = useMemo(() => {
    const divs = events.filter((e) => e.type === "divergence");
    if (divs.length === 0) return 1.0;
    const flagged = divs.filter((e) => (e.data as { flagged?: boolean }).flagged).length;
    return 1 - flagged / divs.length;
  }, [events]);

  const pct = Math.round(score * 100);
  const color = pct > 80 ? "text-emerald-400" : pct > 50 ? "text-amber-400" : "text-rose-400";

  return (
    <div className="flex h-full flex-col items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/60">
      <div className="text-xs uppercase tracking-wider text-zinc-500">Agreement</div>
      <div className={`text-5xl font-bold tabular-nums ${color}`}>{pct}%</div>
      <div className="mt-2 text-xs text-zinc-500">primary ↔ shadow</div>
    </div>
  );
}
