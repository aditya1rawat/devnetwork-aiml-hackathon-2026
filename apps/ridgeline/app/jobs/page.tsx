"use client";
import { useEffect, useRef, useState } from "react";
import { BrandChrome } from "@/components/brand";
import { useFault } from "@/lib/fault-context";
import { isPresetFault } from "@/lib/utils";

type Tone = "ok" | "warn" | "danger";
interface Worker {
  id: string;
  heap: number;
  queue: number;
  status: Tone;
  started: string;
}

const mono: React.CSSProperties = { fontFamily: "var(--brand-font-mono)" };
const GRID = "140px 110px 1fr 120px 110px";

const INITIAL: Worker[] = [
  { id: "worker-1", heap: 0.41, queue: 240, status: "ok", started: "08:42" },
  { id: "worker-2", heap: 0.52, queue: 1180, status: "ok", started: "08:42" },
  { id: "worker-3", heap: 0.5, queue: 1240, status: "ok", started: "08:42" },
  { id: "worker-4", heap: 0.38, queue: 198, status: "ok", started: "08:42" },
];

const OOM_STATE: Worker[] = [
  { id: "worker-1", heap: 0.41, queue: 240, status: "ok", started: "08:42" },
  { id: "worker-2", heap: 0.74, queue: 1900, status: "warn", started: "08:42" },
  { id: "worker-3", heap: 0.99, queue: 11820, status: "danger", started: "08:42" },
  { id: "worker-4", heap: 0.38, queue: 198, status: "ok", started: "08:42" },
];

const OOM_FAULT = {
  scenario: "worker-oom",
  service: "worker",
  symptom: "Worker heap climbing, job queue backing up",
} as const;

const BAR_COLOR: Record<Tone, string> = {
  ok: "var(--brand-accent)",
  warn: "oklch(0.84 0.14 80)",
  danger: "var(--brand-danger)",
};

export default function JobsPage() {
  const { raise } = useFault();
  const [workers, setWorkers] = useState<Worker[]>(INITIAL);
  const [oom, setOom] = useState(false);
  const raised = useRef(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (isPresetFault()) {
      setWorkers(OOM_STATE);
      setOom(true);
      if (!raised.current) {
        raised.current = true;
        raise(OOM_FAULT);
      }
      return;
    }
    timer.current = window.setInterval(() => {
      setWorkers((prev) =>
        prev.map((w) => {
          if (w.id === "worker-3") {
            const heap = Math.min(0.99, w.heap + 0.045);
            const status: Tone = heap >= 0.92 ? "danger" : heap >= 0.7 ? "warn" : "ok";
            const queue = heap >= 0.92 ? 11820 : Math.round(w.queue + 900);
            return { ...w, heap, status, queue };
          }
          if (w.id === "worker-2") {
            const heap = Math.min(0.74, w.heap + 0.012);
            return { ...w, heap, status: heap >= 0.7 ? "warn" : "ok", queue: w.queue + 120 };
          }
          return w;
        }),
      );
    }, 600);
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [raise]);

  useEffect(() => {
    const w3 = workers.find((w) => w.id === "worker-3");
    if (w3 && w3.heap >= 0.92 && !raised.current) {
      raised.current = true;
      setOom(true);
      if (timer.current) window.clearInterval(timer.current);
      raise(OOM_FAULT);
    }
  }, [workers, raise]);

  return (
    <BrandChrome surfaceLabel="Batch Jobs" degraded={oom}>
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
          RIDGELINE / BATCH JOBS / CONSOLE
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
            <span>Worker</span>
            <span>Status</span>
            <span>Heap</span>
            <span style={{ textAlign: "right" }}>Queue</span>
            <span style={{ textAlign: "right" }}>Started</span>
          </div>
          {workers.map((w) => (
            <div
              key={w.id}
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
              <span>{w.id}</span>
              <Badge tone={w.status} />
              <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span
                  style={{
                    position: "relative",
                    width: "min(360px, 100%)",
                    height: 8,
                    background: "var(--brand-surface-2)",
                    border: "1px solid var(--brand-border)",
                  }}
                >
                  <span
                    style={{
                      position: "absolute",
                      inset: 0,
                      width: `${w.heap * 100}%`,
                      background: BAR_COLOR[w.status],
                      transition: "width 500ms cubic-bezier(0.22,1,0.36,1), background 200ms",
                    }}
                  />
                </span>
                <span
                  style={{
                    fontVariantNumeric: "tabular-nums",
                    color: w.status === "danger" ? "var(--brand-danger)" : "var(--brand-fg-muted)",
                  }}
                >
                  {(w.heap * 100).toFixed(0)}%
                </span>
              </span>
              <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{w.queue.toLocaleString()}</span>
              <span style={{ textAlign: "right", color: "var(--brand-fg-muted)", fontVariantNumeric: "tabular-nums" }}>
                {w.started}
              </span>
            </div>
          ))}
        </section>

        {oom ? (
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
            <div>worker-3 heap_used=3.8GB queue_depth=11820 in_flight=24</div>
            <div>worker-3 gc_pause_ms=412 rss=4.1GB</div>
            <div>worker-3 OOMKilled, restarting…</div>
          </div>
        ) : null}
      </div>
    </BrandChrome>
  );
}

function Badge({ tone }: { tone: Tone }) {
  const label = tone === "ok" ? "OK" : tone === "warn" ? "WARN" : "OOM";
  const color = tone === "danger" ? "var(--brand-danger)" : tone === "warn" ? "oklch(0.84 0.14 80)" : "var(--brand-accent)";
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
      {label}
    </span>
  );
}
