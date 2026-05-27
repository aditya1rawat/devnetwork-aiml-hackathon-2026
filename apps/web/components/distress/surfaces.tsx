import type { CSSProperties, ReactElement, ReactNode } from "react";
import type { DemoScenario } from "@/lib/api";
import { BrandButton } from "@/components/distress/brand";
import { DistressTrigger } from "@/components/distress/trigger";

type SurfaceProps = { scenario: DemoScenario };

const display: CSSProperties = {
  fontFamily: "var(--brand-font-display)",
  color: "var(--brand-fg)",
};
const mono: CSSProperties = {
  fontFamily: "var(--brand-font-mono)",
  color: "var(--brand-fg)",
};

function Breadcrumb({ parts }: { parts: string[] }) {
  return (
    <span
      style={{
        ...mono,
        fontSize: 10.5,
        letterSpacing: "0.22em",
        textTransform: "uppercase",
        color: "var(--brand-fg-dim)",
      }}
    >
      {parts.join("  /  ")}
    </span>
  );
}

function PageHeader({
  scenario,
  crumbs,
  headline,
  accentWord,
}: {
  scenario: DemoScenario;
  crumbs: string[];
  headline: ReactNode;
  accentWord?: string;
}) {
  return (
    <header style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 880 }}>
      <Breadcrumb parts={crumbs} />
      <h1
        style={{
          ...display,
          fontSize: 32,
          fontWeight: 600,
          lineHeight: 1.1,
          letterSpacing: "-0.02em",
          margin: 0,
        }}
      >
        {accentWord ? (
          <>
            {headline} <span style={{ color: "var(--brand-accent)" }}>{accentWord}</span>.
          </>
        ) : (
          headline
        )}
      </h1>
      <p
        style={{
          ...mono,
          fontSize: 13,
          lineHeight: 1.6,
          color: "var(--brand-fg-muted)",
          margin: 0,
          maxWidth: 640,
        }}
      >
        {scenario.symptom}.
      </p>
    </header>
  );
}

function ActionRow({
  scenario,
  secondaryLabel,
}: {
  scenario: DemoScenario;
  secondaryLabel: string;
}) {
  return (
    <section style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
      <DistressTrigger scenario={scenario.id} />
      <BrandButton variant="ghost" tabIndex={-1}>
        {secondaryLabel}
      </BrandButton>
    </section>
  );
}

function LogStrip({ lines }: { lines: string[] }) {
  return (
    <section
      style={{
        border: "1px solid var(--brand-border)",
        background: "var(--brand-surface)",
        padding: 16,
        ...mono,
        fontSize: 12,
        color: "var(--brand-fg-muted)",
        lineHeight: 1.7,
        whiteSpace: "pre-wrap",
      }}
    >
      {lines.join("\n")}
    </section>
  );
}

function StatusBadge({
  label,
  tone,
}: {
  label: string;
  tone: "ok" | "warn" | "danger";
}) {
  const toneStyle: Record<typeof tone, CSSProperties> = {
    ok: {
      background: "transparent",
      color: "var(--brand-success)",
      borderColor: "var(--brand-border)",
    },
    warn: {
      background: "var(--brand-surface-2)",
      color: "oklch(0.84 0.14 80)",
      borderColor: "var(--brand-border-strong)",
    },
    danger: {
      background: "color-mix(in oklch, var(--brand-danger) 25%, var(--brand-bg))",
      color: "var(--brand-danger)",
      borderColor: "var(--brand-danger)",
    },
  };
  return (
    <span
      style={{
        ...mono,
        display: "inline-flex",
        alignItems: "center",
        height: 22,
        padding: "0 8px",
        border: "1px solid",
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        ...toneStyle[tone],
      }}
    >
      {label}
    </span>
  );
}

// -----------------------------------------------------------------------------
// 1. batch-console (worker-oom) — wide table of worker runs + heap bars
// -----------------------------------------------------------------------------

function BatchConsoleSurface({ scenario }: SurfaceProps) {
  const workers = [
    { id: "worker-1", status: "ok" as const, heap: 0.41, queue: 240, started: "08:42" },
    { id: "worker-2", status: "warn" as const, heap: 0.68, queue: 11820, started: "08:42" },
    { id: "worker-3", status: "danger" as const, heap: 0.92, queue: 11820, started: "08:42" },
    { id: "worker-4", status: "ok" as const, heap: 0.38, queue: 198, started: "08:42" },
  ];
  return (
    <SurfaceLayout>
      <PageHeader
        scenario={scenario}
        crumbs={["RIDGELINE", "BATCH JOBS", "CONSOLE"]}
        headline="Worker pool is"
        accentWord="backlogged"
      />
      <ActionRow scenario={scenario} secondaryLabel="View runbook" />
      <section
        style={{
          border: "1px solid var(--brand-border)",
          background: "var(--brand-surface)",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "140px 110px 1fr 120px 110px",
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
              gridTemplateColumns: "140px 110px 1fr 120px 110px",
              alignItems: "center",
              padding: "14px 16px",
              borderBottom: "1px solid var(--brand-border)",
              ...mono,
              fontSize: 12.5,
              color: "var(--brand-fg)",
            }}
          >
            <span>{w.id}</span>
            <StatusBadge
              label={w.status === "ok" ? "OK" : w.status === "warn" ? "WARN" : "OOM"}
              tone={w.status}
            />
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
                    background:
                      w.status === "danger"
                        ? "var(--brand-danger)"
                        : w.status === "warn"
                          ? "oklch(0.84 0.14 80)"
                          : "var(--brand-accent)",
                  }}
                />
              </span>
              <span
                style={{
                  fontVariantNumeric: "tabular-nums",
                  color:
                    w.status === "danger" ? "var(--brand-danger)" : "var(--brand-fg-muted)",
                }}
              >
                {(w.heap * 100).toFixed(0)}%
              </span>
            </span>
            <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
              {w.queue.toLocaleString()}
            </span>
            <span
              style={{
                textAlign: "right",
                color: "var(--brand-fg-muted)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {w.started}
            </span>
          </div>
        ))}
      </section>
      <LogStrip
        lines={[
          `worker-3 heap_used=3.8GB queue_depth=11820 in_flight=24`,
          `worker-3 gc_pause_ms=412 rss=4.1GB`,
          `worker-2 heap_used=2.1GB queue_depth=11820 in_flight=18`,
          scenario.sampleLog,
        ]}
      />
    </SurfaceLayout>
  );
}

// -----------------------------------------------------------------------------
// 2. query-studio (db-saturation) — SQL pane + tabs with Profile active
// -----------------------------------------------------------------------------

function QueryStudioSurface({ scenario }: SurfaceProps) {
  const sql = `SELECT  o.id, o.customer_id, o.total, p.status
FROM    orders o
JOIN    payments p ON p.order_id = o.id
WHERE   o.created_at > now() - interval '24 hours'
  AND   p.status IN ('pending','authorized')
ORDER BY o.created_at DESC
LIMIT 500;`;
  const metrics = [
    { label: "latency_p50", value: "180ms", tone: "muted" as const },
    { label: "latency_p95", value: "920ms", tone: "warn" as const },
    { label: "latency_p99", value: scenario.metric.value, tone: "danger" as const },
    { label: "rows_scanned", value: "1.2M", tone: "muted" as const },
    { label: "pool_wait", value: "640ms", tone: "warn" as const },
    { label: "conn_inflight", value: "16 / 16", tone: "danger" as const },
  ];
  const toneColor: Record<"muted" | "warn" | "danger", string> = {
    muted: "var(--brand-fg)",
    warn: "oklch(0.84 0.14 80)",
    danger: "var(--brand-danger)",
  };
  return (
    <SurfaceLayout>
      <PageHeader
        scenario={scenario}
        crumbs={["RIDGELINE", "QUERY STUDIO", "QUERY #4781"]}
        headline="Query is"
        accentWord="hanging"
      />
      <ActionRow scenario={scenario} secondaryLabel="View slow query" />
      <section
        style={{
          border: "1px solid var(--brand-border)",
          background: "var(--brand-surface)",
          display: "flex",
          flexDirection: "column",
        }}
      >
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
          <span style={{ marginLeft: "auto", color: "var(--brand-fg-muted)" }}>
            READ-ONLY · SHARED
          </span>
        </div>
        <pre
          style={{
            ...mono,
            margin: 0,
            padding: "18px 20px",
            fontSize: 13,
            lineHeight: 1.65,
            color: "var(--brand-fg)",
            background: "var(--brand-bg)",
            whiteSpace: "pre",
            overflowX: "auto",
          }}
        >
          {sql}
        </pre>
      </section>
      <section style={{ border: "1px solid var(--brand-border)", background: "var(--brand-surface)" }}>
        <div
          style={{
            display: "flex",
            borderBottom: "1px solid var(--brand-border)",
            ...mono,
            fontSize: 10.5,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
          }}
        >
          {[
            { label: "Results", active: false },
            { label: "Profile", active: true },
            { label: "History", active: false },
          ].map((tab) => (
            <span
              key={tab.label}
              style={{
                padding: "12px 18px",
                color: tab.active ? "var(--brand-fg)" : "var(--brand-fg-dim)",
                borderBottom: tab.active
                  ? "2px solid var(--brand-accent)"
                  : "2px solid transparent",
                marginBottom: -1,
              }}
            >
              {tab.label}
            </span>
          ))}
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: 1,
            background: "var(--brand-border)",
          }}
        >
          {metrics.map((m) => (
            <div
              key={m.label}
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
                {m.label}
              </span>
              <span
                style={{
                  ...display,
                  fontSize: 28,
                  fontWeight: 600,
                  fontVariantNumeric: "tabular-nums",
                  color: toneColor[m.tone],
                }}
              >
                {m.value}
              </span>
            </div>
          ))}
        </div>
      </section>
      <LogStrip lines={[scenario.sampleLog, `slow_query_log: stmt=#4781 t=1502ms rows=487`]} />
    </SurfaceLayout>
  );
}

// -----------------------------------------------------------------------------
// 3. sign-in (auth-5xx) — centered narrow form, red Sign in button
// -----------------------------------------------------------------------------

function SignInSurface({ scenario }: SurfaceProps) {
  return (
    <SurfaceLayout>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 28,
          maxWidth: 380,
          margin: "60px auto 0",
          width: "100%",
        }}
      >
        <div
          style={{
            ...display,
            fontSize: 22,
            fontWeight: 600,
            letterSpacing: "-0.015em",
            color: "var(--brand-fg)",
          }}
        >
          Ridgeline<span style={{ color: "var(--brand-accent)" }}>.</span>
        </div>
        <div
          role="alert"
          style={{
            width: "100%",
            border: "1px solid var(--brand-danger)",
            background: "color-mix(in oklch, var(--brand-danger) 18%, var(--brand-bg))",
            padding: "12px 14px",
            display: "flex",
            alignItems: "center",
            gap: 10,
            ...mono,
            fontSize: 12,
            color: "var(--brand-fg)",
          }}
        >
          <StatusBadge label="5xx" tone="danger" />
          <span style={{ color: "var(--brand-fg-muted)" }}>{scenario.sampleLog}</span>
        </div>
        <form
          style={{ display: "flex", flexDirection: "column", gap: 14, width: "100%" }}
          action="#"
        >
          <label
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              ...mono,
              fontSize: 10.5,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "var(--brand-fg-dim)",
            }}
          >
            Email
            <input
              type="email"
              defaultValue="ops@ridgeline.io"
              tabIndex={-1}
              readOnly
              style={{
                height: 38,
                padding: "0 12px",
                background: "var(--brand-surface)",
                border: "1px solid var(--brand-border-strong)",
                color: "var(--brand-fg)",
                ...mono,
                fontSize: 13,
                letterSpacing: 0,
                textTransform: "none",
                borderRadius: 0,
              }}
            />
          </label>
          <label
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              ...mono,
              fontSize: 10.5,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "var(--brand-fg-dim)",
            }}
          >
            Password
            <input
              type="password"
              defaultValue="********"
              tabIndex={-1}
              readOnly
              style={{
                height: 38,
                padding: "0 12px",
                background: "var(--brand-surface)",
                border: "1px solid var(--brand-border-strong)",
                color: "var(--brand-fg)",
                ...mono,
                fontSize: 13,
                letterSpacing: 0,
                textTransform: "none",
                borderRadius: 0,
              }}
            />
          </label>
          <button
            type="button"
            tabIndex={-1}
            disabled
            style={{
              height: 40,
              border: "1px solid var(--brand-danger)",
              background: "color-mix(in oklch, var(--brand-danger) 70%, var(--brand-bg))",
              color: "var(--brand-fg)",
              ...mono,
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              cursor: "not-allowed",
              opacity: 0.85,
              borderRadius: 0,
            }}
          >
            Sign in failed · 503
          </button>
        </form>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 10,
            alignItems: "center",
            paddingTop: 6,
          }}
        >
          <p
            style={{
              ...mono,
              fontSize: 11,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--brand-fg-muted)",
              margin: 0,
            }}
          >
            Auth service is failing 48% of verify calls
          </p>
          <div style={{ display: "flex", gap: 12 }}>
            <DistressTrigger scenario={scenario.id} />
            <BrandButton variant="ghost" tabIndex={-1}>
              Retry
            </BrandButton>
          </div>
        </div>
      </div>
    </SurfaceLayout>
  );
}

// -----------------------------------------------------------------------------
// 4. app-dashboard (api-brownout) — mixed asymmetric tiles
// -----------------------------------------------------------------------------

function AppDashboardSurface({ scenario }: SurfaceProps) {
  const kpis = [
    { label: "req_p50", value: "240ms" },
    { label: "req_p99", value: scenario.metric.value, danger: true },
    { label: "inflight", value: "42" },
    { label: "error_rate", value: "8.4%", danger: true },
  ];
  return (
    <SurfaceLayout>
      <PageHeader
        scenario={scenario}
        crumbs={["RIDGELINE", "DASHBOARD", "OVERVIEW"]}
        headline="App is"
        accentWord="brownout"
      />
      <ActionRow scenario={scenario} secondaryLabel="Reload tiles" />
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)",
          gap: 16,
        }}
      >
        <div
          style={{
            border: "1px solid var(--brand-border)",
            background: "var(--brand-surface)",
            padding: 24,
            minHeight: 220,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <span
            style={{
              ...mono,
              fontSize: 10.5,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "var(--brand-fg-dim)",
            }}
          >
            Pipeline volume · last 30m
          </span>
          <svg viewBox="0 0 600 140" style={{ width: "100%", height: 140 }}>
            <polyline
              fill="none"
              stroke="var(--brand-border-strong)"
              strokeWidth="1"
              points="0,80 60,76 120,72 180,68 240,64 300,60 360,58 420,55 480,52 540,50 600,48"
            />
            <polyline
              fill="none"
              stroke="var(--brand-danger)"
              strokeWidth="1.5"
              points="0,90 60,86 120,82 180,80 240,72 300,55 360,40 420,30 480,24 540,20 600,18"
            />
          </svg>
          <span style={{ ...mono, fontSize: 11, color: "var(--brand-fg-muted)" }}>
            error rate diverging from baseline at 14:08
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 1, background: "var(--brand-border)" }}>
          {kpis.map((k, idx) => (
            <div
              key={k.label}
              style={{
                background: "var(--brand-surface)",
                padding: idx % 2 === 0 ? "18px 20px" : "26px 20px",
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              <span
                style={{
                  ...mono,
                  fontSize: 10,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  color: "var(--brand-fg-dim)",
                }}
              >
                {k.label}
              </span>
              <span
                style={{
                  ...display,
                  fontSize: idx % 2 === 0 ? 22 : 28,
                  fontWeight: 600,
                  fontVariantNumeric: "tabular-nums",
                  color: k.danger ? "var(--brand-danger)" : "var(--brand-fg)",
                }}
              >
                {k.value}
              </span>
            </div>
          ))}
        </div>
      </section>
      <section style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
        {["billing", "ingest", "search"].map((label) => (
          <div
            key={label}
            style={{
              border: "1px solid var(--brand-border)",
              background: "var(--brand-surface)",
              padding: 16,
              display: "flex",
              flexDirection: "column",
              gap: 10,
              minHeight: 92,
            }}
          >
            <span
              style={{
                ...mono,
                fontSize: 10,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "var(--brand-fg-dim)",
              }}
            >
              {label}
            </span>
            <span
              style={{
                width: "60%",
                height: 8,
                background: "var(--brand-surface-2)",
                border: "1px solid var(--brand-border)",
              }}
              aria-hidden
            />
            <span
              style={{
                width: "40%",
                height: 8,
                background: "var(--brand-surface-2)",
                border: "1px solid var(--brand-border)",
              }}
              aria-hidden
            />
            <span style={{ ...mono, fontSize: 11, color: "var(--brand-fg-dim)" }}>
              loading · stuck for 14s
            </span>
          </div>
        ))}
      </section>
    </SurfaceLayout>
  );
}

// -----------------------------------------------------------------------------
// 5. connections (db-timeout) — full-width table of upstream connections
// -----------------------------------------------------------------------------

function ConnectionsSurface({ scenario }: SurfaceProps) {
  const rows = [
    { glyph: "▣", host: "db-primary.us-east-2", port: 5432, p95: "92ms", status: "ok" as const },
    { glyph: "▣", host: "db-replica-a.us-east-2", port: 5432, p95: "108ms", status: "ok" as const },
    { glyph: "◆", host: "db-proxy.internal", port: 6432, p95: "2.5s", status: "danger" as const },
    { glyph: "◆", host: "db-proxy-shadow.internal", port: 6432, p95: "2.4s", status: "danger" as const },
    { glyph: "○", host: "cache-1.us-east-2", port: 6379, p95: "0.8ms", status: "ok" as const },
    { glyph: "○", host: "cache-2.us-east-2", port: 6379, p95: "0.9ms", status: "ok" as const },
    { glyph: "✦", host: "queue.us-east-2", port: 4222, p95: "12ms", status: "warn" as const },
  ];
  const summary = [
    { label: "total", value: "7" },
    { label: "degraded", value: "1", danger: false },
    { label: "timing out", value: "2", danger: true },
  ];
  return (
    <SurfaceLayout>
      <PageHeader
        scenario={scenario}
        crumbs={["RIDGELINE", "CONNECTIONS", "UPSTREAMS"]}
        headline="2 upstreams are"
        accentWord="timing out"
      />
      <ActionRow scenario={scenario} secondaryLabel="Open pipeline" />
      <section style={{ display: "flex", gap: 12 }}>
        {summary.map((s) => (
          <div
            key={s.label}
            style={{
              border: "1px solid var(--brand-border)",
              background: "var(--brand-surface)",
              padding: "10px 16px",
              display: "flex",
              alignItems: "baseline",
              gap: 10,
              ...mono,
              fontSize: 11,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "var(--brand-fg-dim)",
            }}
          >
            <span>{s.label}</span>
            <span
              style={{
                fontVariantNumeric: "tabular-nums",
                color: s.danger ? "var(--brand-danger)" : "var(--brand-fg)",
                fontSize: 14,
              }}
            >
              {s.value}
            </span>
          </div>
        ))}
      </section>
      <section style={{ border: "1px solid var(--brand-border)", background: "var(--brand-surface)" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "44px 1fr 90px 110px 130px",
            ...mono,
            fontSize: 10.5,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "var(--brand-fg-dim)",
            padding: "12px 16px",
            borderBottom: "1px solid var(--brand-border)",
          }}
        >
          <span />
          <span>Host</span>
          <span>Port</span>
          <span style={{ textAlign: "right" }}>p95</span>
          <span style={{ textAlign: "right" }}>Status</span>
        </div>
        {rows.map((r) => (
          <div
            key={r.host}
            style={{
              display: "grid",
              gridTemplateColumns: "44px 1fr 90px 110px 130px",
              alignItems: "center",
              padding: "12px 16px",
              borderBottom: "1px solid var(--brand-border)",
              ...mono,
              fontSize: 12.5,
            }}
          >
            <span style={{ color: "var(--brand-fg-dim)" }}>{r.glyph}</span>
            <span>{r.host}</span>
            <span style={{ color: "var(--brand-fg-muted)", fontVariantNumeric: "tabular-nums" }}>
              {r.port}
            </span>
            <span
              style={{
                textAlign: "right",
                fontVariantNumeric: "tabular-nums",
                color:
                  r.status === "danger"
                    ? "var(--brand-danger)"
                    : r.status === "warn"
                      ? "oklch(0.84 0.14 80)"
                      : "var(--brand-fg)",
              }}
            >
              {r.p95}
            </span>
            <span style={{ display: "flex", justifyContent: "flex-end" }}>
              <StatusBadge
                label={r.status === "ok" ? "OK" : r.status === "warn" ? "SLOW" : "TIMEOUT"}
                tone={r.status}
              />
            </span>
          </div>
        ))}
      </section>
      <LogStrip lines={[scenario.sampleLog, `db-proxy.internal :6432 read_timeout=2500ms`]} />
    </SurfaceLayout>
  );
}

// -----------------------------------------------------------------------------
// 6. deploys (api-config-drift) — vertical timeline of revisions
// -----------------------------------------------------------------------------

function DeploysSurface({ scenario }: SurfaceProps) {
  const deploys = [
    {
      rev: 47,
      author: "ci@ridgeline",
      age: "8m ago",
      status: "drift" as const,
      diff: "config.routing: valid → invalid · pool_size: 16 → 0",
    },
    {
      rev: 46,
      author: "amaya.k",
      age: "3h ago",
      status: "ok" as const,
      diff: "feature flag: search_v2 = true",
    },
    {
      rev: 45,
      author: "ben.p",
      age: "yesterday",
      status: "ok" as const,
      diff: "bump worker memory limit 3GB → 4GB",
    },
    {
      rev: 44,
      author: "ci@ridgeline",
      age: "2d ago",
      status: "ok" as const,
      diff: "rotate db_proxy tls cert",
    },
  ];
  return (
    <SurfaceLayout>
      <PageHeader
        scenario={scenario}
        crumbs={["RIDGELINE", "DEPLOYS", "api"]}
        headline="Revision 47 is"
        accentWord="drifted"
      />
      <ActionRow scenario={scenario} secondaryLabel="Roll back" />
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) 220px",
          gap: 24,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          {deploys.map((d, idx) => {
            const isLast = idx === deploys.length - 1;
            const isDrift = d.status === "drift";
            return (
              <div
                key={d.rev}
                style={{
                  display: "grid",
                  gridTemplateColumns: "32px 1fr",
                  gap: 14,
                  paddingBottom: isLast ? 0 : 22,
                  position: "relative",
                }}
              >
                <span
                  style={{
                    position: "relative",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                  }}
                >
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      border: "1px solid",
                      borderColor: isDrift ? "var(--brand-danger)" : "var(--brand-border-strong)",
                      background: isDrift ? "var(--brand-danger)" : "var(--brand-bg)",
                      marginTop: 6,
                    }}
                  />
                  {!isLast ? (
                    <span
                      style={{
                        flex: 1,
                        width: 1,
                        background: "var(--brand-border)",
                        marginTop: 4,
                      }}
                    />
                  ) : null}
                </span>
                <div
                  style={{
                    border: "1px solid",
                    borderColor: isDrift ? "var(--brand-danger)" : "var(--brand-border)",
                    background: isDrift
                      ? "color-mix(in oklch, var(--brand-danger) 14%, var(--brand-bg))"
                      : "var(--brand-surface)",
                    padding: "14px 16px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span
                      style={{
                        ...mono,
                        fontSize: 12,
                        letterSpacing: "0.16em",
                        textTransform: "uppercase",
                        color: "var(--brand-fg)",
                      }}
                    >
                      rev {d.rev}
                    </span>
                    <span style={{ ...mono, fontSize: 11, color: "var(--brand-fg-muted)" }}>
                      {d.author}
                    </span>
                    <span style={{ ...mono, fontSize: 11, color: "var(--brand-fg-dim)" }}>
                      {d.age}
                    </span>
                    <span style={{ marginLeft: "auto" }}>
                      <StatusBadge
                        label={isDrift ? "DRIFTED" : "OK"}
                        tone={isDrift ? "danger" : "ok"}
                      />
                    </span>
                  </div>
                  <span style={{ ...mono, fontSize: 12, color: "var(--brand-fg-muted)" }}>
                    {d.diff}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        <div
          style={{
            border: "1px solid var(--brand-border)",
            background: "var(--brand-surface)",
            padding: 18,
            display: "flex",
            flexDirection: "column",
            gap: 10,
            height: "fit-content",
          }}
        >
          <span
            style={{
              ...mono,
              fontSize: 10.5,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "var(--brand-fg-dim)",
            }}
          >
            error rate · post-deploy
          </span>
          <svg viewBox="0 0 200 60" style={{ width: "100%", height: 60 }}>
            <polyline
              fill="none"
              stroke="var(--brand-border-strong)"
              strokeWidth="1"
              points="0,52 20,51 40,50 60,49 80,48 100,48"
            />
            <polyline
              fill="none"
              stroke="var(--brand-danger)"
              strokeWidth="1.5"
              points="100,48 110,46 120,40 130,30 140,22 150,16 160,12 170,8 180,6 200,4"
            />
            <line
              x1="100"
              x2="100"
              y1="0"
              y2="60"
              stroke="var(--brand-fg-dim)"
              strokeDasharray="2 3"
            />
          </svg>
          <span style={{ ...mono, fontSize: 11, color: "var(--brand-fg-muted)" }}>
            rev 47 applied · error rate {scenario.metric.value}
          </span>
        </div>
      </section>
      <LogStrip lines={[scenario.sampleLog]} />
    </SurfaceLayout>
  );
}

// -----------------------------------------------------------------------------
// Shared scaffold + resolver
// -----------------------------------------------------------------------------

function SurfaceLayout({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 28,
        width: "100%",
        maxWidth: 1180,
        margin: "0 auto",
      }}
    >
      {children}
    </div>
  );
}

const REGISTRY: Record<string, (props: SurfaceProps) => ReactElement> = {
  "batch-console": BatchConsoleSurface,
  "query-studio": QueryStudioSurface,
  "sign-in": SignInSurface,
  "app-dashboard": AppDashboardSurface,
  connections: ConnectionsSurface,
  deploys: DeploysSurface,
};

export function DistressSurface({ scenario }: SurfaceProps) {
  const Surface = REGISTRY[scenario.surfaceKey];
  if (!Surface) {
    return (
      <SurfaceLayout>
        <PageHeader
          scenario={scenario}
          crumbs={["RIDGELINE", scenario.productLabel.toUpperCase()]}
          headline={scenario.title}
        />
        <ActionRow scenario={scenario} secondaryLabel="View runbook" />
        <LogStrip lines={[scenario.sampleLog]} />
      </SurfaceLayout>
    );
  }
  return <Surface scenario={scenario} />;
}
