"use client";
import { useEffect, useRef, useState } from "react";
import { BrandChrome } from "@/components/brand";
import { useFault } from "@/lib/fault-context";
import { isPresetFault } from "@/lib/utils";

const DB_FAULT = {
  scenario: "db-saturation",
  service: "db_proxy",
  symptom: "Query p99 at 1.5s, connection pool saturating",
} as const;

type Phase = "idle" | "running" | "timeout";

const mono: React.CSSProperties = { fontFamily: "var(--brand-font-mono)" };
const display: React.CSSProperties = { fontFamily: "var(--brand-font-display)" };

const DEFAULT_SQL = `SELECT  o.id, o.customer_id, o.total, p.status
FROM    orders o
JOIN    payments p ON p.order_id = o.id
WHERE   o.created_at > now() - interval '24 hours'
  AND   p.status IN ('pending','authorized')
ORDER BY o.created_at DESC
LIMIT 500;`;

const METRICS: Array<{ label: string; value: string; tone: "muted" | "warn" | "danger" }> = [
  { label: "latency_p50", value: "180ms", tone: "muted" },
  { label: "latency_p95", value: "920ms", tone: "warn" },
  { label: "latency_p99", value: "1.5s", tone: "danger" },
  { label: "rows_scanned", value: "1.2M", tone: "muted" },
  { label: "pool_wait", value: "640ms", tone: "warn" },
  { label: "conn_inflight", value: "16 / 16", tone: "danger" },
];

const TONE: Record<"muted" | "warn" | "danger", string> = {
  muted: "var(--brand-fg)",
  warn: "oklch(0.84 0.14 80)",
  danger: "var(--brand-danger)",
};

export default function QueryPage() {
  const { raise } = useFault();
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsed, setElapsed] = useState(0);
  const raised = useRef(false);
  const tick = useRef<number | null>(null);
  const done = useRef<number | null>(null);

  useEffect(() => {
    if (isPresetFault() && !raised.current) {
      raised.current = true;
      setPhase("timeout");
      setElapsed(1.5);
      raise(DB_FAULT);
    }
    return () => {
      if (tick.current) window.clearInterval(tick.current);
      if (done.current) window.clearTimeout(done.current);
    };
  }, [raise]);

  function run() {
    if (phase === "running") return;
    setPhase("running");
    setElapsed(0);
    const t0 = Date.now();
    tick.current = window.setInterval(() => setElapsed((Date.now() - t0) / 1000), 100);
    done.current = window.setTimeout(() => {
      if (tick.current) window.clearInterval(tick.current);
      setPhase("timeout");
      if (!raised.current) {
        raised.current = true;
        raise(DB_FAULT);
      }
    }, 2500);
  }

  const timedOut = phase === "timeout";

  return (
    <BrandChrome surfaceLabel="Query Studio" degraded={timedOut}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 920, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
          <span
            style={{
              ...mono,
              fontSize: 10.5,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "var(--brand-fg-dim)",
            }}
          >
            RIDGELINE / QUERY STUDIO / QUERY #4781
          </span>
        </div>

        <section style={{ border: "1px solid var(--brand-border)", background: "var(--brand-surface)" }}>
          <div
            style={{
              ...mono,
              fontSize: 10.5,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "var(--brand-fg-dim)",
              padding: "10px 16px",
              borderBottom: "1px solid var(--brand-border)",
              display: "flex",
              gap: 16,
            }}
          >
            <span>EDITOR</span>
            <span style={{ marginLeft: "auto", color: "var(--brand-fg-muted)" }}>POSTGRES · ANALYTICS</span>
          </div>
          <textarea
            defaultValue={DEFAULT_SQL}
            spellCheck={false}
            rows={8}
            style={{
              ...mono,
              width: "100%",
              boxSizing: "border-box",
              padding: "18px 20px",
              fontSize: 13,
              lineHeight: 1.65,
              color: "var(--brand-fg)",
              background: "var(--brand-bg)",
              border: "none",
              outline: "none",
              resize: "vertical",
            }}
          />
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              padding: "12px 16px",
              borderTop: "1px solid var(--brand-border)",
            }}
          >
            <button
              type="button"
              onClick={run}
              disabled={phase === "running"}
              style={{
                height: 34,
                padding: "0 18px",
                border: "1px solid transparent",
                background: "var(--brand-accent)",
                color: "var(--brand-accent-fg)",
                ...mono,
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                cursor: phase === "running" ? "wait" : "pointer",
                borderRadius: 0,
              }}
            >
              {phase === "running" ? `Running… ${elapsed.toFixed(1)}s` : "Run query"}
            </button>
            {timedOut ? (
              <span style={{ ...mono, fontSize: 11, color: "var(--brand-danger)", letterSpacing: "0.06em" }}>
                Query timed out after 1.5s · connection pool exhausted
              </span>
            ) : (
              <span style={{ ...mono, fontSize: 11, color: "var(--brand-fg-dim)", letterSpacing: "0.06em" }}>
                ⌘⏎ to run
              </span>
            )}
          </div>
        </section>

        {timedOut ? (
          <>
            <section style={{ border: "1px solid var(--brand-border)", background: "var(--brand-surface)" }}>
              <div
                style={{
                  ...mono,
                  fontSize: 10.5,
                  letterSpacing: "0.22em",
                  textTransform: "uppercase",
                  color: "var(--brand-fg)",
                  padding: "12px 18px",
                  borderBottom: "1px solid var(--brand-border)",
                }}
              >
                Profile
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                  gap: 1,
                  background: "var(--brand-border)",
                }}
              >
                {METRICS.map((m) => (
                  <div
                    key={m.label}
                    style={{ background: "var(--brand-surface)", padding: "18px 20px", display: "flex", flexDirection: "column", gap: 6 }}
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
                      {m.label}
                    </span>
                    <span style={{ ...display, fontSize: 26, fontWeight: 600, fontVariantNumeric: "tabular-nums", color: TONE[m.tone] }}>
                      {m.value}
                    </span>
                  </div>
                ))}
              </div>
            </section>
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
              <div>db pool exhausted inflight=16</div>
              <div>slow_query_log: stmt=#4781 t=1502ms rows=487</div>
            </div>
          </>
        ) : null}
      </div>
    </BrandChrome>
  );
}
