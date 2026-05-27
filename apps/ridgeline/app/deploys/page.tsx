"use client";
import { useEffect, useRef, useState } from "react";
import { BrandChrome } from "@/components/brand";
import { useFault } from "@/lib/fault-context";
import { isPresetFault } from "@/lib/utils";

type Phase = "deploying" | "live-ok" | "errored";

const mono: React.CSSProperties = { fontFamily: "var(--brand-font-mono)" };
const display: React.CSSProperties = { fontFamily: "var(--brand-font-display)" };
const GRID = "90px 1fr 130px 110px";

const DRIFT_FAULT = {
  scenario: "api-config-drift",
  service: "api",
  symptom: "Error spike immediately after config revision 47",
} as const;

interface Deploy {
  rev: string;
  desc: string;
  by: string;
  at: string;
  status: "live" | "rollback" | "current";
}

const HISTORY: Deploy[] = [
  { rev: "rev-46", desc: "api: bump rate-limit window 60s", by: "m.okafor", at: "08:02", status: "live" },
  { rev: "rev-45", desc: "worker: batch flush tuning", by: "ci-bot", at: "07:31", status: "live" },
  { rev: "rev-44", desc: "db_proxy: add orders index", by: "l.chen", at: "06:58", status: "live" },
];

export default function DeploysPage() {
  const { raise } = useFault();
  const [phase, setPhase] = useState<Phase>("deploying");
  const [errorRate, setErrorRate] = useState(0);
  const raised = useRef(false);
  const live = useRef<number | null>(null);
  const climb = useRef<number | null>(null);

  useEffect(() => {
    if (isPresetFault()) {
      setPhase("errored");
      setErrorRate(44);
      if (!raised.current) {
        raised.current = true;
        raise(DRIFT_FAULT);
      }
      return;
    }
    // rev-47 finishes deploying, goes live, then error rate spikes
    live.current = window.setTimeout(() => {
      setPhase("live-ok");
      climb.current = window.setInterval(() => {
        setErrorRate((v) => {
          const next = Math.min(44, v + 6);
          if (next >= 44 && !raised.current) {
            raised.current = true;
            setPhase("errored");
            if (climb.current) window.clearInterval(climb.current);
            raise(DRIFT_FAULT);
          } else if (next > 0) {
            setPhase("errored");
          }
          return next;
        });
      }, 500);
    }, 1600);
    return () => {
      if (live.current) window.clearTimeout(live.current);
      if (climb.current) window.clearInterval(climb.current);
    };
  }, [raise]);

  const deploying = phase === "deploying";
  const errored = errorRate > 0;
  const tone = errored ? "var(--brand-danger)" : "var(--brand-accent)";

  return (
    <BrandChrome surfaceLabel="Deploys" degraded={phase === "errored"}>
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
          RIDGELINE / DEPLOYS / API
        </span>

        {/* Active deploy: revision 47 */}
        <section style={{ border: `1px solid ${errored ? "var(--brand-danger)" : "var(--brand-border)"}`, background: "var(--brand-surface)" }}>
          <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
              <span style={{ ...display, fontSize: 18, fontWeight: 600, color: "var(--brand-fg)" }}>
                rev-47 · api routing config
              </span>
              <span
                style={{
                  ...mono,
                  fontSize: 9.5,
                  fontWeight: 700,
                  letterSpacing: "0.16em",
                  padding: "3px 9px",
                  border: `1px solid ${deploying ? "oklch(0.84 0.14 80)" : tone}`,
                  color: deploying ? "oklch(0.84 0.14 80)" : tone,
                }}
              >
                {deploying ? "DEPLOYING" : errored ? "ERRORING" : "LIVE"}
              </span>
            </div>
            <span style={{ ...mono, fontSize: 12, color: "var(--brand-fg-muted)", letterSpacing: "0.04em" }}>
              s.patel · pushed to prod-east · just now
            </span>

            {deploying ? (
              <span style={{ position: "relative", height: 3, background: "var(--brand-surface-2)", overflow: "hidden" }}>
                <span
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: "40%",
                    background: "var(--brand-accent)",
                    animation: "rdg-deploy 1.1s infinite cubic-bezier(0.4,0,0.2,1)",
                  }}
                />
                <style>{"@keyframes rdg-deploy{0%{transform:translateX(-110%)}100%{transform:translateX(310%)}}"}</style>
              </span>
            ) : (
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 10,
                  borderTop: "1px solid var(--brand-border)",
                  paddingTop: 12,
                }}
              >
                <span style={{ ...mono, fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--brand-fg-dim)" }}>
                  error_rate
                </span>
                <span style={{ ...display, fontSize: 26, fontWeight: 600, fontVariantNumeric: "tabular-nums", color: tone }}>
                  {errorRate}%
                </span>
              </div>
            )}
          </div>

          {errored ? (
            <div
              style={{
                ...mono,
                fontSize: 11,
                color: "var(--brand-fg-muted)",
                borderTop: "1px solid var(--brand-border)",
                background: "var(--brand-bg)",
                padding: "12px 16px",
                lineHeight: 1.7,
              }}
            >
              <div>config revision 47 applied: routing=invalid pool_size=0</div>
              <div>api 5xx rate={errorRate}% since rev-47 (rollback available)</div>
            </div>
          ) : null}
        </section>

        {/* Deploy history */}
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
            <span>Revision</span>
            <span>Change</span>
            <span>By</span>
            <span style={{ textAlign: "right" }}>Time</span>
          </div>
          {HISTORY.map((d) => (
            <div
              key={d.rev}
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
              <span style={{ color: "var(--brand-fg-muted)" }}>{d.rev}</span>
              <span>{d.desc}</span>
              <span style={{ color: "var(--brand-fg-muted)" }}>{d.by}</span>
              <span style={{ textAlign: "right", color: "var(--brand-fg-dim)", fontVariantNumeric: "tabular-nums" }}>
                {d.at}
              </span>
            </div>
          ))}
        </section>
      </div>
    </BrandChrome>
  );
}
