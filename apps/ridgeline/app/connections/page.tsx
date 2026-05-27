"use client";
import { useEffect, useRef, useState } from "react";
import { BrandChrome } from "@/components/brand";
import { useFault } from "@/lib/fault-context";
import { isPresetFault } from "@/lib/utils";

type Tone = "ok" | "warn" | "danger";
interface Conn {
  name: string;
  engine: string;
  latency: number; // ms
  timeoutPct: number;
  status: Tone;
  upstream: boolean; // routed through db_proxy
}

const mono: React.CSSProperties = { fontFamily: "var(--brand-font-mono)" };
const GRID = "1fr 150px 100px 120px 90px";

const TIMEOUT_FAULT = {
  scenario: "db-timeout",
  service: "db_proxy",
  symptom: "Upstream db calls timing out from api",
} as const;

const INITIAL: Conn[] = [
  { name: "postgres-analytics", engine: "postgres · db_proxy", latency: 42, timeoutPct: 0, status: "ok", upstream: true },
  { name: "postgres-orders", engine: "postgres · db_proxy", latency: 38, timeoutPct: 0, status: "ok", upstream: true },
  { name: "redis-cache", engine: "redis", latency: 2, timeoutPct: 0, status: "ok", upstream: false },
  { name: "s3-blobstore", engine: "s3", latency: 88, timeoutPct: 0, status: "ok", upstream: false },
];

const TIMEOUT_STATE: Conn[] = [
  { name: "postgres-analytics", engine: "postgres · db_proxy", latency: 2500, timeoutPct: 31, status: "danger", upstream: true },
  { name: "postgres-orders", engine: "postgres · db_proxy", latency: 2480, timeoutPct: 28, status: "danger", upstream: true },
  { name: "redis-cache", engine: "redis", latency: 2, timeoutPct: 0, status: "ok", upstream: false },
  { name: "s3-blobstore", engine: "s3", latency: 88, timeoutPct: 0, status: "ok", upstream: false },
];

const STATUS_COLOR: Record<Tone, string> = {
  ok: "var(--brand-accent)",
  warn: "oklch(0.84 0.14 80)",
  danger: "var(--brand-danger)",
};

const STATUS_LABEL: Record<Tone, string> = { ok: "OK", warn: "SLOW", danger: "TIMEOUT" };

export default function ConnectionsPage() {
  const { raise } = useFault();
  const [conns, setConns] = useState<Conn[]>(INITIAL);
  const [down, setDown] = useState(false);
  const raised = useRef(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (isPresetFault()) {
      setConns(TIMEOUT_STATE);
      setDown(true);
      if (!raised.current) {
        raised.current = true;
        raise(TIMEOUT_FAULT);
      }
      return;
    }
    timer.current = window.setInterval(() => {
      setConns((prev) =>
        prev.map((c) => {
          if (!c.upstream) return c;
          const latency = Math.min(2500, c.latency + 320);
          const timeoutPct = Math.min(31, Math.round(c.timeoutPct + 4));
          const status: Tone = latency >= 2000 ? "danger" : latency >= 800 ? "warn" : "ok";
          return { ...c, latency, timeoutPct, status };
        }),
      );
    }, 600);
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [raise]);

  useEffect(() => {
    const stalled = conns.some((c) => c.upstream && c.latency >= 2500);
    if (stalled && !raised.current) {
      raised.current = true;
      setDown(true);
      if (timer.current) window.clearInterval(timer.current);
      raise(TIMEOUT_FAULT);
    }
  }, [conns, raise]);

  return (
    <BrandChrome surfaceLabel="Connections" degraded={down}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 980, margin: "0 auto" }}>
        <span
          style={{
            ...mono,
            fontSize: 10.5,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "var(--brand-fg-dim)",
          }}
        >
          RIDGELINE / DATA / CONNECTIONS
        </span>

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
            <span>Source</span>
            <span>Status</span>
            <span style={{ textAlign: "right" }}>Latency</span>
            <span style={{ textAlign: "right" }}>Timeouts</span>
            <span style={{ textAlign: "right" }}>Pool</span>
          </div>
          {conns.map((c) => (
            <div
              key={c.name}
              style={{
                display: "grid",
                gridTemplateColumns: GRID,
                alignItems: "center",
                padding: "14px 16px",
                borderBottom: "1px solid var(--brand-border)",
                ...mono,
                fontSize: 12.5,
                color: "var(--brand-fg)",
              }}
            >
              <span style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <span>{c.name}</span>
                <span style={{ fontSize: 10.5, color: "var(--brand-fg-dim)", letterSpacing: "0.04em" }}>{c.engine}</span>
              </span>
              <Badge tone={c.status} />
              <span
                style={{
                  textAlign: "right",
                  fontVariantNumeric: "tabular-nums",
                  color: c.status === "danger" ? "var(--brand-danger)" : c.status === "warn" ? "oklch(0.84 0.14 80)" : "var(--brand-fg-muted)",
                }}
              >
                {c.latency >= 1000 ? `${(c.latency / 1000).toFixed(1)}s` : `${c.latency}ms`}
              </span>
              <span
                style={{
                  textAlign: "right",
                  fontVariantNumeric: "tabular-nums",
                  color: c.timeoutPct > 0 ? "var(--brand-danger)" : "var(--brand-fg-muted)",
                }}
              >
                {c.timeoutPct}%
              </span>
              <span style={{ textAlign: "right", color: "var(--brand-fg-muted)", fontVariantNumeric: "tabular-nums" }}>
                16/16
              </span>
            </div>
          ))}
        </section>

        {down ? (
          <div
            style={{
              ...mono,
              fontSize: 11,
              color: "var(--brand-fg-muted)",
              border: "1px solid var(--brand-border)",
              background: "var(--brand-bg)",
              padding: "12px 16px",
              lineHeight: 1.7,
            }}
          >
            <div>worker failed err=ReadTimeout job=rollup-4812 upstream=db_proxy</div>
            <div>api → db_proxy p99=2502ms timeout_rate=31%</div>
          </div>
        ) : null}
      </div>
    </BrandChrome>
  );
}

function Badge({ tone }: { tone: Tone }) {
  const color = STATUS_COLOR[tone];
  return (
    <span
      style={{
        ...mono,
        fontSize: 9.5,
        fontWeight: 700,
        letterSpacing: "0.16em",
        padding: "2px 8px",
        border: `1px solid ${color}`,
        color,
        justifySelf: "start",
      }}
    >
      {STATUS_LABEL[tone]}
    </span>
  );
}
