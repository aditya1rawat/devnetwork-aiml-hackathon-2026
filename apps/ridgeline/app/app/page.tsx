"use client";
import { useEffect, useRef, useState } from "react";
import { BrandChrome } from "@/components/brand";
import { useFault } from "@/lib/fault-context";
import { isPresetFault } from "@/lib/utils";

const mono: React.CSSProperties = { fontFamily: "var(--brand-font-mono)" };
const display: React.CSSProperties = { fontFamily: "var(--brand-font-display)" };

const BROWNOUT_FAULT = {
  scenario: "api-brownout",
  service: "api",
  symptom: "App slow, requests piling inflight",
} as const;

const PANELS = ["Active Pipelines", "Throughput (rows/min)", "Events / sec", "Error Budget"];

const P99_MIN = 0.18;
const P99_MAX = 1.2;
const INFLIGHT_MIN = 8;
const INFLIGHT_MAX = 42;

export default function AppDashboardPage() {
  const { raise } = useFault();
  const [p99, setP99] = useState(P99_MIN);
  const [inflight, setInflight] = useState(INFLIGHT_MIN);
  const [brownout, setBrownout] = useState(false);
  const raised = useRef(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (isPresetFault()) {
      setP99(P99_MAX);
      setInflight(INFLIGHT_MAX);
      setBrownout(true);
      if (!raised.current) {
        raised.current = true;
        raise(BROWNOUT_FAULT);
      }
      return;
    }
    timer.current = window.setInterval(() => {
      setP99((v) => Math.min(P99_MAX, v + 0.085));
      setInflight((v) => Math.min(INFLIGHT_MAX, v + 3));
    }, 600);
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [raise]);

  useEffect(() => {
    if (p99 >= P99_MAX && !raised.current) {
      raised.current = true;
      setBrownout(true);
      if (timer.current) window.clearInterval(timer.current);
      raise(BROWNOUT_FAULT);
    }
  }, [p99, raise]);

  const tone = brownout ? "var(--brand-danger)" : p99 >= 0.7 ? "oklch(0.84 0.14 80)" : "var(--brand-accent)";

  return (
    <BrandChrome surfaceLabel="Dashboard" degraded={brownout}>
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
          RIDGELINE / APP / DASHBOARD
        </span>

        {/* Request health strip */}
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: 1,
            background: "var(--brand-border)",
            border: "1px solid var(--brand-border)",
          }}
        >
          <Stat label="request_p99" value={`${p99.toFixed(2)}s`} tone={tone} />
          <Stat label="inflight" value={`${inflight}`} tone={tone} />
          <Stat label="api_status" value={brownout ? "BROWNOUT" : p99 >= 0.7 ? "DEGRADED" : "OK"} tone={tone} />
        </section>

        {/* Dashboard panels that stall under load */}
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: 1,
            background: "var(--brand-border)",
            border: "1px solid var(--brand-border)",
          }}
        >
          {PANELS.map((title) => (
            <div
              key={title}
              style={{
                background: "var(--brand-surface)",
                padding: "20px 22px",
                display: "flex",
                flexDirection: "column",
                gap: 12,
                minHeight: 96,
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
                {title}
              </span>
              {brownout ? (
                <span style={{ ...mono, fontSize: 12, color: "var(--brand-danger)", letterSpacing: "0.04em" }}>
                  request timed out · {p99.toFixed(1)}s
                </span>
              ) : (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 9 }}>
                  <Spinner />
                  <span style={{ ...mono, fontSize: 11, color: "var(--brand-fg-muted)", letterSpacing: "0.06em" }}>
                    loading…
                  </span>
                </span>
              )}
            </div>
          ))}
        </section>

        {brownout ? (
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
            <div>api inflight={inflight} latency_p99={Math.round(p99 * 1000)}ms</div>
            <div>api worker pool saturated, requests queueing</div>
          </div>
        ) : null}
      </div>
    </BrandChrome>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div style={{ background: "var(--brand-surface)", padding: "20px 22px", display: "flex", flexDirection: "column", gap: 6 }}>
      <span
        style={{
          ...mono,
          fontSize: 10.5,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "var(--brand-fg-dim)",
        }}
      >
        {label}
      </span>
      <span style={{ ...display, fontSize: 26, fontWeight: 600, fontVariantNumeric: "tabular-nums", color: tone }}>
        {value}
      </span>
    </div>
  );
}

function Spinner() {
  return (
    <span
      aria-hidden
      style={{
        width: 12,
        height: 12,
        borderRadius: "50%",
        border: "2px solid var(--brand-border-strong)",
        borderTopColor: "var(--brand-fg-muted)",
        display: "inline-block",
        animation: "rdg-spin 0.8s linear infinite",
      }}
    >
      <style>{"@keyframes rdg-spin{to{transform:rotate(360deg)}}"}</style>
    </span>
  );
}
