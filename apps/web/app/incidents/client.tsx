"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { listIncidents, listHistoricalIncidents, type HistoricalIncident, type IncidentSummary } from "@/lib/api";
import { ArgusNav } from "@/components/argus-nav";

export function IncidentsClient() {
  const [incidents, setIncidents] = useState<IncidentSummary[] | null>(null);
  const [historical, setHistorical] = useState<HistoricalIncident[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let stop = false;
    const tick = async () => {
      try {
        const list = await listIncidents();
        if (!stop) setIncidents(list);
      } catch (e) {
        if (!stop) setErr(String(e));
      }
    };
    tick();
    const t = setInterval(tick, 2500);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, []);

  useEffect(() => {
    let alive = true;
    listHistoricalIncidents().then((items) => {
      if (alive) setHistorical(items);
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <main className="min-h-screen bg-[var(--color-bg)] text-[var(--color-fg)]">
      <ArgusNav active="incidents" />

      <div className="mx-auto w-full max-w-[1100px] px-6 py-12 space-y-12">
        <header className="space-y-3">
          <p className="font-mono-label text-[var(--color-fg-dim)]">argus / incidents</p>
          <h1 className="font-display text-[44px] font-light tracking-[-0.02em] leading-[1.05] text-[var(--color-fg)]">
            Browse runs
          </h1>
          <p className="max-w-[60ch] font-mono text-[14px] leading-[1.55] text-[var(--color-fg-muted)]">
            Past investigations and the historical case base. Page a fresh scenario from the{" "}
            <Link href="/dashboard" className="text-[var(--color-fg)] underline decoration-[var(--color-border-strong)] underline-offset-4 transition-colors hover:decoration-[var(--color-fg)]">
              dashboard
            </Link>
            .
          </p>
          {err ? <p className="font-mono-meta" style={{ color: "var(--color-danger)" }}>{err}</p> : null}
        </header>

        <section className="space-y-4">
          <div className="flex items-baseline justify-between">
            <SectionLabel label="argus-resolved · past runs" />
            <span className="font-mono-meta tnum text-[var(--color-fg-dim)]">
              {incidents === null ? "…" : `${incidents.length} total`}
            </span>
          </div>
          {incidents === null ? (
            <p className="font-mono-meta text-[var(--color-fg-dim)]">loading…</p>
          ) : incidents.length === 0 ? (
            <EmptyRuns />
          ) : (
            <ul className="border-y border-[var(--color-border)]">
              {incidents.map((i) => (
                <IncidentRow key={i.id} incident={i} />
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-4">
          <div className="flex items-baseline justify-between">
            <SectionLabel label="historical · pre-argus cases" />
            <span className="font-mono-meta tnum text-[var(--color-fg-dim)]">
              {historical === null ? "…" : `${historical.length} in kb`}
            </span>
          </div>
          {historical === null ? (
            <p className="font-mono-meta text-[var(--color-fg-dim)]">loading…</p>
          ) : historical.length === 0 ? (
            <p className="font-mono-meta text-[var(--color-fg-dim)]">no historical cases in the knowledge base.</p>
          ) : (
            <ul className="border-y border-[var(--color-border)]">
              {historical.map((h) => (
                <HistoricalRow key={h.incident_id} incident={h} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}

function SectionLabel({ label }: { label: string }) {
  return <h2 className="font-mono-label text-[var(--color-fg-dim)]">{label}</h2>;
}

function IncidentRow({ incident }: { incident: IncidentSummary }) {
  const { color, soft, label } = statusVisual(incident.status);
  const duration = incident.endedAt ? formatDuration(incident.endedAt - incident.startedAt) : null;

  return (
    <li className="border-t border-[var(--color-border)] first:border-t-0">
      <Link
        href={`/incident/${incident.id}`}
        className="group flex flex-col gap-2.5 px-5 py-4 transition-colors hover:bg-[var(--color-surface)]"
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span
              className="inline-flex items-center gap-1.5 border px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.2em]"
              style={{
                color,
                borderColor: `color-mix(in oklch, ${color} 45%, transparent)`,
                background: `color-mix(in oklch, ${soft} 30%, transparent)`,
              }}
            >
              <span
                aria-hidden
                className="inline-block h-1.5 w-1.5"
                style={{ background: color, boxShadow: incident.status === "running" ? `0 0 8px ${color}` : undefined }}
              />
              {label}
            </span>
            <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-[var(--color-fg-dim)]">
              {incident.stepCount} steps{duration ? ` · ${duration}` : ""}
              {incident.failedOver ? " · failover" : ""}
            </span>
          </div>
          <span className="font-mono text-[11.5px] text-[var(--color-fg-dim)] transition-colors group-hover:text-[var(--color-fg)]">
            {incident.id} ↗
          </span>
        </div>
        {incident.scenarioTitle ? (
          <p className="text-[14px] font-normal text-[var(--color-fg)] font-display">{incident.scenarioTitle}</p>
        ) : null}
        {incident.reportPreview ? (
          <p className="font-mono text-[12.5px] leading-[1.55] text-[var(--color-fg-muted)] line-clamp-2">{firstLine(incident.reportPreview)}</p>
        ) : null}
      </Link>
    </li>
  );
}

function HistoricalRow({ incident }: { incident: HistoricalIncident }) {
  const services = (incident.services_touched ?? []).join(" · ");
  return (
    <li className="border-t border-[var(--color-border)] first:border-t-0">
      <Link
        href={`/incident/${incident.incident_id}`}
        className="group flex flex-col gap-2 px-5 py-4 transition-colors hover:bg-[var(--color-surface)]"
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-baseline gap-3">
            <span className="inline-block h-1.5 w-1.5 translate-y-[-1px] bg-[var(--color-fg-dim)]" />
            <span className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-[var(--color-fg-dim)]">
              historical
            </span>
            {incident.severity ? (
              <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-[var(--color-fg-dim)]">
                · {incident.severity}
              </span>
            ) : null}
            {services ? (
              <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-[var(--color-fg-dim)]">
                · {services}
              </span>
            ) : null}
          </div>
          <span className="font-mono text-[11.5px] text-[var(--color-fg-dim)] transition-colors group-hover:text-[var(--color-fg)]">
            {incident.incident_id} ↗
          </span>
        </div>
        {incident.title ? (
          <p className="text-[14px] font-normal text-[var(--color-fg)] font-display">
            {incident.title}
          </p>
        ) : null}
      </Link>
    </li>
  );
}

function EmptyRuns() {
  return (
    <div className="flex flex-col items-center gap-2 border border-dashed border-[var(--color-border)] px-6 py-12 text-center">
      <p className="font-mono-label text-[var(--color-fg-dim)]">no runs yet</p>
      <p className="max-w-[40ch] font-mono text-[13px] text-[var(--color-fg-muted)]">
        Page Argus from the status board to launch an investigation. Past runs accumulate here.
      </p>
    </div>
  );
}

function statusVisual(status: IncidentSummary["status"]): { color: string; soft: string; label: string } {
  switch (status) {
    case "running":
      return { color: "var(--color-info)", soft: "var(--color-info-soft)", label: "investigating" };
    case "failed_over":
      return { color: "var(--color-warn)", soft: "var(--color-warn-soft)", label: "failed over" };
    case "halted":
      return { color: "var(--color-danger)", soft: "var(--color-danger-soft)", label: "failed" };
    case "resolved":
      return { color: "var(--color-success)", soft: "var(--color-success-soft)", label: "resolved" };
  }
}

function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  return `${m}m ${String(rs).padStart(2, "0")}s`;
}

function firstLine(md: string): string {
  const cleaned = md.replace(/^#+\s*/gm, "").trim();
  const line = cleaned.split("\n").find((l) => l.trim().length > 0) ?? "";
  return line.slice(0, 160);
}
