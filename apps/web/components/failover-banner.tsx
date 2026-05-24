"use client";
import { useMemo } from "react";
import type { StreamEvent } from "@/lib/types";

export function FailoverBanner({ events }: { events: StreamEvent[] }) {
  const recent = useMemo(() => {
    return [...events].reverse().find((e) => e.type === "failover" || e.type === "gateway_mode");
  }, [events]);

  if (!recent) return null;

  const data = recent.data as { from?: string; to?: string; reason?: string; error?: string; mode?: string };

  if (recent.type === "failover") {
    const reason = data.reason ?? "unknown";
    const detail = (data.error ?? "").slice(0, 180);
    return (
      <Banner tone="danger" eyebrow="failover" headline={`Promoted ${data.to ?? "shadow"} after ${data.from ?? "primary"} ${reason.replace(/_/g, " ")}`}>
        {detail ? <code className="block max-w-full overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[11px] text-[var(--color-fg-dim)]">{detail}</code> : null}
      </Banner>
    );
  }

  const mode = data.mode ?? "?";
  if (mode === "direct") {
    return (
      <Banner tone="warn" eyebrow="gateway" headline="TrueFoundry Gateway severed. Direct mode engaged.">
        <span className="font-mono text-[11px] text-[var(--color-fg-dim)]">providers calling raw endpoints; gateway features (rate limits, logging) bypassed</span>
      </Banner>
    );
  }
  return (
    <Banner tone="success" eyebrow="gateway" headline="Gateway restored. Routing through TrueFoundry." />
  );
}

function Banner({ tone, eyebrow, headline, children }: { tone: "danger" | "warn" | "success"; eyebrow: string; headline: string; children?: React.ReactNode }) {
  const palette = {
    danger: { border: "var(--color-danger)", bg: "var(--color-danger-soft)", tag: "var(--color-danger)" },
    warn: { border: "var(--color-warn)", bg: "var(--color-shadow-soft)", tag: "var(--color-warn)" },
    success: { border: "var(--color-success)", bg: "var(--color-success-soft)", tag: "var(--color-success)" },
  }[tone];

  return (
    <div
      className="flex items-start gap-4 rounded-xl border px-5 py-4"
      style={{ borderColor: palette.border + "66", background: palette.bg + "30" }}
    >
      <span
        className="mt-1 inline-flex shrink-0 items-center rounded-md border px-2 py-0.5 font-mono-label"
        style={{ borderColor: palette.tag + "55", color: palette.tag }}
      >
        {eyebrow}
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-[15.5px] font-light leading-snug text-[var(--color-fg)]">{headline}</p>
        {children ? <div>{children}</div> : null}
      </div>
    </div>
  );
}
