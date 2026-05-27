"use client";
import { BrandChrome } from "@/components/brand";

const mono: React.CSSProperties = { fontFamily: "var(--brand-font-mono)" };
const display: React.CSSProperties = { fontFamily: "var(--brand-font-display)" };

const STATS: Array<{ label: string; value: string; sub?: string }> = [
  { label: "pipelines", value: "24", sub: "active" },
  { label: "throughput", value: "1.4M", sub: "rows / min" },
  { label: "jobs (24h)", value: "3,812", sub: "completed" },
  { label: "uptime", value: "99.97%", sub: "30d" },
];

const PIPELINES: Array<{ name: string; status: "ok" | "warn" | "err"; rate: string; lag: string }> = [
  { name: "orders-ingest", status: "ok", rate: "12.4k/s", lag: "180ms" },
  { name: "payments-stream", status: "ok", rate: "8.1k/s", lag: "220ms" },
  { name: "user-events", status: "warn", rate: "3.2k/s", lag: "1.4s" },
  { name: "analytics-rollup", status: "ok", rate: "940/s", lag: "60ms" },
  { name: "fraud-scoring", status: "ok", rate: "2.8k/s", lag: "340ms" },
  { name: "inventory-sync", status: "err", rate: "0/s", lag: "—" },
];

const ACTIVITY: Array<{ time: string; msg: string }> = [
  { time: "08:41", msg: "deploy: analytics-rollup v2.14.0 → prod-east" },
  { time: "08:38", msg: "alert: user-events consumer lag > 1s (auto-resolved)" },
  { time: "08:22", msg: "scale: payments-stream partitions 8 → 12" },
  { time: "08:10", msg: "deploy: fraud-scoring v1.9.3 → prod-west" },
  { time: "07:55", msg: "maintenance: inventory-sync paused for schema migration" },
  { time: "07:41", msg: "config: orders-ingest batch_size 500 → 1000" },
];

const STATUS_COLOR: Record<string, string> = {
  ok: "var(--brand-accent)",
  warn: "oklch(0.84 0.14 80)",
  err: "var(--brand-danger)",
};

const STATUS_LABEL: Record<string, string> = {
  ok: "OK",
  warn: "LAG",
  err: "DOWN",
};

const GRID = "1fr 80px 100px 90px";

export default function OverviewPage() {
  return (
    <BrandChrome surfaceLabel="Overview">
      <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 980, margin: "0 auto" }}>
        <span
          style={{
            ...mono,
            fontSize: 10.5,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "var(--brand-fg-dim)",
          }}
        >
          RIDGELINE / OVERVIEW
        </span>

        {/* Stats row */}
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            gap: 1,
            background: "var(--brand-border)",
            border: "1px solid var(--brand-border)",
          }}
        >
          {STATS.map((s) => (
            <div
              key={s.label}
              style={{
                background: "var(--brand-surface)",
                padding: "20px 22px",
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              <span
                style={{
                  ...mono,
                  fontSize: 10.5,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  color: "var(--brand-fg-dim)",
                }}
              >
                {s.label}
              </span>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span style={{ ...display, fontSize: 28, fontWeight: 600, fontVariantNumeric: "tabular-nums", color: "var(--brand-fg)" }}>
                  {s.value}
                </span>
                {s.sub ? (
                  <span style={{ ...mono, fontSize: 11, color: "var(--brand-fg-muted)", letterSpacing: "0.06em" }}>
                    {s.sub}
                  </span>
                ) : null}
              </div>
            </div>
          ))}
        </section>

        {/* Pipelines table */}
        <section style={{ border: "1px solid var(--brand-border)", background: "var(--brand-surface)" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: GRID,
              ...mono,
              fontSize: 10.5,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "var(--brand-fg-dim)",
              padding: "12px 16px",
              borderBottom: "1px solid var(--brand-border)",
            }}
          >
            <span>Pipeline</span>
            <span>Status</span>
            <span style={{ textAlign: "right" }}>Rate</span>
            <span style={{ textAlign: "right" }}>Lag</span>
          </div>
          {PIPELINES.map((p) => (
            <div
              key={p.name}
              style={{
                display: "grid",
                gridTemplateColumns: GRID,
                alignItems: "center",
                padding: "13px 16px",
                borderBottom: "1px solid var(--brand-border)",
                ...mono,
                fontSize: 12.5,
                color: "var(--brand-fg)",
              }}
            >
              <span>{p.name}</span>
              <span>
                <span
                  style={{
                    ...mono,
                    fontSize: 9.5,
                    fontWeight: 700,
                    letterSpacing: "0.16em",
                    padding: "2px 8px",
                    border: `1px solid ${STATUS_COLOR[p.status]}`,
                    color: STATUS_COLOR[p.status],
                  }}
                >
                  {STATUS_LABEL[p.status]}
                </span>
              </span>
              <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: "var(--brand-fg-muted)" }}>
                {p.rate}
              </span>
              <span
                style={{
                  textAlign: "right",
                  fontVariantNumeric: "tabular-nums",
                  color: p.status === "warn" ? "oklch(0.84 0.14 80)" : "var(--brand-fg-muted)",
                }}
              >
                {p.lag}
              </span>
            </div>
          ))}
        </section>

        {/* Recent activity */}
        <section style={{ border: "1px solid var(--brand-border)", background: "var(--brand-surface)" }}>
          <div
            style={{
              ...mono,
              fontSize: 10.5,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "var(--brand-fg-dim)",
              padding: "12px 16px",
              borderBottom: "1px solid var(--brand-border)",
            }}
          >
            Recent Activity
          </div>
          {ACTIVITY.map((a, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                gap: 14,
                padding: "10px 16px",
                borderBottom: "1px solid var(--brand-border)",
                ...mono,
                fontSize: 12,
                lineHeight: 1.5,
              }}
            >
              <span style={{ color: "var(--brand-fg-dim)", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
                {a.time}
              </span>
              <span style={{ color: "var(--brand-fg-muted)" }}>{a.msg}</span>
            </div>
          ))}
        </section>
      </div>
    </BrandChrome>
  );
}
