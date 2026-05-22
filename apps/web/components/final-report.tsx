"use client";
import { useMemo } from "react";
import type { StreamEvent } from "@/lib/types";

export function FinalReport({ events }: { events: StreamEvent[] }) {
  const md = useMemo(() => {
    const e = [...events].reverse().find((x) => x.type === "incident_done");
    return e ? String((e.data as { report_md?: string }).report_md ?? "") : "";
  }, [events]);
  if (!md) return null;
  return (
    <div className="mt-6 rounded-lg border border-emerald-700/40 bg-emerald-950/20 p-4">
      <div className="mb-2 text-xs uppercase tracking-wider text-emerald-300">Final Report</div>
      <pre className="whitespace-pre-wrap font-mono text-sm text-zinc-200">{md}</pre>
    </div>
  );
}
