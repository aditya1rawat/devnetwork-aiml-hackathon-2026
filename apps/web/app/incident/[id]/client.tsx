"use client";
import { useEffect } from "react";
import { useSSE } from "@/lib/sse";
import { startIncident, streamUrl } from "@/lib/api";
import { SplitStream } from "@/components/split-stream";
import { ChaosPanel } from "@/components/chaos-panel";
import { Timeline } from "@/components/timeline";
import { FailoverBanner } from "@/components/failover-banner";
import { FinalReport } from "@/components/final-report";

export function IncidentClient({ id }: { id: string }) {
  const events = useSSE(streamUrl(id));

  useEffect(() => {
    startIncident(id).catch(() => {});
  }, [id]);

  const primary =
    ([...events].reverse().find((e) => e.type === "primary_step")?.data as { provider?: string })?.provider ?? "claude";
  const shadow =
    ([...events].reverse().find((e) => e.type === "shadow_step")?.data as { provider?: string })?.provider ?? "nemotron";

  return (
    <main className="min-h-screen bg-zinc-950 p-6 text-zinc-100">
      <div className="mx-auto max-w-7xl space-y-4">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">incident · {id}</h1>
          <span className="text-xs text-zinc-500">argus</span>
        </header>

        <FailoverBanner events={events} />
        <Timeline events={events} />
        <SplitStream events={events} primary={primary} shadow={shadow} />
        <ChaosPanel />
        <FinalReport events={events} />
      </div>
    </main>
  );
}
