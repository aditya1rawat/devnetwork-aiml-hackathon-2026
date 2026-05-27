import { BrandButton, BrandChrome } from "@/components/distress/brand";

export default function BrandCheckPage() {
  return (
    <BrandChrome surfaceLabel="batch jobs">
      <div style={{ display: "flex", flexDirection: "column", gap: 32, maxWidth: 880 }}>
        <header style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span
            style={{
              fontFamily: "var(--brand-font-mono)",
              fontSize: 10.5,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "var(--brand-fg-dim)",
            }}
          >
            BATCH&nbsp;JOBS&nbsp;/&nbsp;CONSOLE
          </span>
          <h1
            style={{
              fontFamily: "var(--brand-font-display)",
              fontSize: 44,
              fontWeight: 600,
              lineHeight: 1.08,
              letterSpacing: "-0.02em",
              color: "var(--brand-fg)",
              margin: 0,
            }}
          >
            Worker pool is <span style={{ color: "var(--brand-accent)" }}>backlogged</span>.
          </h1>
          <p
            style={{
              fontFamily: "var(--brand-font-mono)",
              fontSize: 13,
              lineHeight: 1.6,
              color: "var(--brand-fg-muted)",
              maxWidth: 620,
              margin: 0,
            }}
          >
            Queue depth has climbed past 11k items in the last 8 minutes. Worker-3 heap is at 92%
            and rising. Ridgeline cannot drain at the current ingest rate.
          </p>
        </header>

        <section style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <BrandButton variant="primary">PAGE&nbsp;ARGUS</BrandButton>
          <BrandButton variant="ghost">VIEW&nbsp;RUNBOOK</BrandButton>
        </section>

        <section
          style={{
            border: "1px solid var(--brand-border)",
            background: "var(--brand-surface)",
            padding: 16,
            fontFamily: "var(--brand-font-mono)",
            fontSize: 12,
            color: "var(--brand-fg-muted)",
            lineHeight: 1.7,
            whiteSpace: "pre-wrap",
          }}
        >
          {`worker-3 heap_used=3.8GB  queue_depth=11820  in_flight=24
worker-3 gc_pause_ms=412  rss=4.1GB
worker-2 heap_used=2.1GB  queue_depth=11820  in_flight=18`}
        </section>
      </div>
    </BrandChrome>
  );
}
