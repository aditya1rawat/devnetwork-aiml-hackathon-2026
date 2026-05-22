"use client";
import { useMemo } from "react";
import type { StreamEvent } from "@/lib/types";

export function ReasoningPane({ role, events, provider }: { role: "primary" | "shadow"; events: StreamEvent[]; provider: string }) {
  const steps = useMemo(() => {
    const type = role === "primary" ? "primary_step" : "shadow_step";
    return events.filter((e) => e.type === type);
  }, [events, role]);

  const dead = useMemo(() => {
    if (role !== "shadow") return false;
    return events.some((e) => e.type === "failover");
  }, [events, role]);

  return (
    <div className={`flex h-full flex-col border ${role === "primary" ? "border-indigo-500/40" : "border-amber-500/40"} bg-zinc-900/40 rounded-lg`}>
      <div className={`px-4 py-2 text-xs uppercase tracking-wider border-b ${role === "primary" ? "border-indigo-500/30 text-indigo-300" : "border-amber-500/30 text-amber-300"} flex justify-between`}>
        <span>{role} — {provider}</span>
        {dead && role === "shadow" ? <span className="text-rose-400">promoted → primary</span> : null}
      </div>
      <div className="flex-1 overflow-auto p-3 space-y-2 font-mono text-xs text-zinc-300">
        {steps.map((e, i) => {
          const data = e.data as { step?: number; text?: string; error?: string };
          if (data.error) {
            return <div key={i} className="rounded border border-rose-700/40 bg-rose-900/20 p-2 text-rose-300">step {data.step}: {data.error}</div>;
          }
          return (
            <div key={i} className="rounded border border-zinc-800 bg-zinc-950 p-2 whitespace-pre-wrap">
              <div className="mb-1 text-zinc-500">step {data.step}</div>
              {data.text}
            </div>
          );
        })}
      </div>
    </div>
  );
}
