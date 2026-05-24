"use client";
import { ReasoningPane } from "./reasoning-pane";
import type { StreamEvent } from "@/lib/types";

export function SplitStream({
  leftSteps,
  rightSteps,
  leftProvider,
  rightProvider,
  failedOver = false,
  failoverStepNum,
}: {
  leftSteps: StreamEvent[];
  rightSteps: StreamEvent[];
  leftProvider: string;
  rightProvider: string | null;
  failedOver?: boolean;
  failoverStepNum?: number;
}) {
  return (
    <section className="grid h-[640px] grid-cols-2 gap-4">
      <ReasoningPane
        role="primary"
        steps={leftSteps}
        provider={leftProvider}
        state={failedOver ? "killed" : "live"}
        eventAtStep={failoverStepNum}
      />
      {rightProvider ? (
        <ReasoningPane
          role="shadow"
          steps={rightSteps}
          provider={rightProvider}
          state={failedOver ? "promoted" : "live"}
          eventAtStep={failoverStepNum}
        />
      ) : (
        <EmptyShadow />
      )}
    </section>
  );
}

function EmptyShadow() {
  return (
    <div className="flex h-full flex-col items-center justify-center rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)]/30 text-center">
      <div className="font-mono-label text-[var(--color-fg-dim)]">shadow offline</div>
      <p className="mt-2 max-w-[28ch] font-light text-[15px] text-[var(--color-fg-muted)]">
        No second cognition. Primary is operating without redundancy.
      </p>
    </div>
  );
}
