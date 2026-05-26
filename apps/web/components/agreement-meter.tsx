"use client";
import { useMemo } from "react";
import type { StreamEvent } from "@/lib/types";

export function AgreementMeter({ events, shadowPromoted = false }: { events: StreamEvent[]; shadowPromoted?: boolean }) {
  const { pct, flagged, total } = useMemo(() => {
    const divs = events.filter((e) => e.type === "divergence");
    const total = divs.length;
    const flagged = divs.filter((e) => (e.data as { flagged?: boolean }).flagged).length;
    if (total === 0) return { pct: 100, flagged: 0, total: 0 };
    const scores = divs.map((e) => {
      const d = e.data as { agreement?: number; flagged?: boolean; cosine?: number; actionMismatch?: boolean; argsMismatch?: boolean };
      if (typeof d.agreement === "number") return d.agreement;
      // Backward compat: synthesize from legacy fields
      const actionMatch = !d.actionMismatch;
      const argsMatch = actionMatch && !d.argsMismatch;
      const cos = typeof d.cosine === "number" ? d.cosine : 0;
      return 0.30 * (actionMatch ? 1 : 0) + 0.15 * (argsMatch ? 1 : 0) + 0.55 * cos;
    });
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    return { pct: Math.round(mean * 100), flagged, total };
  }, [events]);

  if (shadowPromoted) {
    return (
      <div className="flex h-full flex-col justify-between rounded-xl border border-[var(--color-warn)]/40 bg-[var(--color-shadow-soft)]/15 px-5 py-4">
        <div className="font-mono-label text-[var(--color-fg-dim)]">agreement</div>
        <div className="flex flex-col gap-1">
          <span className="font-serif-display text-[22px] italic leading-none text-[var(--color-warn)]">solo</span>
          <span className="font-mono-meta text-[var(--color-fg-muted)]">shadow promoted</span>
        </div>
        <div className="font-mono-meta text-[var(--color-fg-dim)]">no second cognition</div>
      </div>
    );
  }

  const color =
    pct >= 80 ? "var(--color-success)" : pct >= 50 ? "var(--color-warn)" : "var(--color-danger)";

  return (
    <div className="flex h-full flex-col gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 px-5 py-4">
      <div className="font-mono-label text-[var(--color-fg-dim)]">agreement</div>

      <div className="flex items-baseline gap-1">
        <span className="font-display text-[44px] font-extralight leading-none tnum" style={{ color }}>{pct}</span>
        <span className="font-mono text-[15px] text-[var(--color-fg-dim)]">%</span>
      </div>

      <Bar pct={pct} color={color} />

      <dl className="mt-auto grid grid-cols-2 gap-3 pt-1">
        <Stat label="compared" value={String(total)} />
        <Stat label="flagged" value={String(flagged)} accent={flagged > 0 ? "var(--color-warn)" : undefined} />
      </dl>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="font-mono-label text-[var(--color-fg-dim)]">{label}</dt>
      <dd className="font-mono text-[15px] font-light tnum" style={{ color: accent ?? "var(--color-fg)" }}>{value}</dd>
    </div>
  );
}

function Bar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="relative h-1 w-full overflow-hidden rounded-full bg-[var(--color-border)]/50">
      <div
        className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-500 ease-out"
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  );
}
