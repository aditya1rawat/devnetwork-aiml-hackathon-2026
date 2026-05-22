"use client";
import type { StreamEvent } from "@/lib/types";

export function FailoverBanner({ events }: { events: StreamEvent[] }) {
  const last = [...events].reverse().find((e) => e.type === "failover" || e.type === "gateway_mode");
  if (!last) return null;
  const data = last.data as { from?: string; to?: string; reason?: string; mode?: string };
  const text =
    last.type === "failover"
      ? `Primary failed (${data.reason}) → promoted ${data.to ?? "shadow"}`
      : `Gateway mode: ${data.mode}`;
  return (
    <div className="mb-3 rounded-md border border-rose-500/40 bg-rose-900/20 px-3 py-2 text-sm text-rose-200">
      {text}
    </div>
  );
}
