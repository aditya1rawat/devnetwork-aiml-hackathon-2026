"use client";
import { ReasoningPane } from "./reasoning-pane";
import { AgreementMeter } from "./agreement-meter";
import type { StreamEvent } from "@/lib/types";

export function SplitStream({ events, primary, shadow }: { events: StreamEvent[]; primary: string; shadow: string | null }) {
  return (
    <div className="grid h-[60vh] grid-cols-[1fr_140px_1fr] gap-3">
      <ReasoningPane role="primary" events={events} provider={primary} />
      <AgreementMeter events={events} />
      {shadow ? (
        <ReasoningPane role="shadow" events={events} provider={shadow} />
      ) : (
        <div className="flex h-full items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/40 text-zinc-600">
          no shadow
        </div>
      )}
    </div>
  );
}
