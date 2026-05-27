"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { listIncidents, listHistoricalIncidents, type HistoricalIncident, type IncidentSummary } from "@/lib/api";

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
      <Topbar />

      <div className="mx-auto w-full max-w-[1100px] px-6 py-10 space-y-12">
        <header className="space-y-3">
          <p className="font-mono-label text-[var(--color-fg-dim)]">argus / incidents</p>
          <h1 className="font-display text-[44px] font-extralight tracking-tight leading-[1.05]">
            Browse <span className="font-serif-display italic text-[var(--color-fg-muted)]">runs</span>.
          </h1>
          <p className="max-w-[52ch] text-[15.5px] font-light leading-[1.55] text-[var(--color-fg-muted)]">
            Past investigations and the historical case base. Page a fresh scenario from the{" "}
            <Link href="/status" className="text-[var(--color-fg)] underline decoration-[var(--color-border-strong)] underline-offset-4 transition-colors hover:text-[var(--color-primary)]">
              status board
            </Link>
            .
          </p>
          {err ? <p className="font-mono-meta text-[var(--color-danger)]">{err}</p> : null}
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
            <ul className="divide-y divide-[var(--color-border)] rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]/40">
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
            <ul className="divide-y divide-[var(--color-border)] rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]/40">
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

function Topbar() {
  return (
    <header className="sticky top-0 z-30 border-b border-[var(--color-border)] bg-[var(--color-bg)]/85 backdrop-blur supports-[backdrop-filter]:bg-[var(--color-bg)]/70">
      <div className="mx-auto flex w-full max-w-[1400px] items-center justify-between gap-6 px-6 py-3.5">
        <Link href="/" className="font-mono-label text-[var(--color-fg-dim)] transition-colors hover:text-[var(--color-fg)]">
          argus
        </Link>
        <nav className="flex items-center gap-5">
          <Link href="/status" className="font-mono-label text-[var(--color-fg-dim)] transition-colors hover:text-[var(--color-fg)]">
            status
          </Link>
          <Link href="/incidents" className="font-mono-label text-[var(--color-fg)]">
            incidents
          </Link>
        </nav>
      </div>
    </header>
  );
}

function SectionLabel({ label }: { label: string }) {
  return <h2 className="font-mono-label text-[var(--color-fg-dim)]">{label}</h2>;
}

function IncidentRow({ incident }: { incident: IncidentSummary }) {
  const { color, label } = statusVisual(incident.status);
  const duration = incident.endedAt ? formatDuration(incident.endedAt - incident.startedAt) : null;

  return (
    <li>
      <Link
        href={`/incident/${incident.id}`}
        className="group flex flex-col gap-2.5 px-5 py-4 transition-colors hover:bg-[var(--color-surface)]/70"
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-baseline gap-3">
            <span
              className="inline-block h-1.5 w-1.5 translate-y-[-1px] rounded-full"
              style={{ background: color, boxShadow: incident.status === "running" ? `0 0 8px ${color}` : undefined }}
            />
            <span className="font-mono text-[10.5px] uppercase tracking-[0.22em]" style={{ color }}>
              {label}
            </span>
            <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-[var(--color-fg-dim)]">
              · {incident.stepCount} steps{duration ? ` · ${duration}` : ""}
              {incident.failedOver ? " · failover" : ""}
            </span>
          </div>
          <span className="font-mono text-[11.5px] text-[var(--color-fg-dim)] transition-colors group-hover:text-[var(--color-fg)]">
            {incident.id} ↗
          </span>
        </div>
        {incident.scenarioTitle ? (
          <p className="font-serif-display text-[15.5px] italic text-[var(--color-fg-muted)]">{incident.scenarioTitle}</p>
        ) : null}
        {incident.reportPreview ? (
          <p className="text-[13.5px] font-light leading-[1.5] text-[var(--color-fg-muted)] line-clamp-2">{firstLine(incident.reportPreview)}</p>
        ) : null}
      </Link>
    </li>
  );
}

function HistoricalRow({ incident }: { incident: HistoricalIncident }) {
  const services = (incident.services_touched ?? []).join(" · ");
  return (
    <li>
      <Link
        href={`/incident/${incident.incident_id}`}
        className="group flex flex-col gap-2 px-5 py-4 transition-colors hover:bg-[var(--color-surface)]/70"
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-baseline gap-3">
            <span className="inline-block h-1.5 w-1.5 translate-y-[-1px] rounded-full bg-[var(--color-fg-dim)]" />
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
          <p className="font-serif-display text-[15.5px] italic text-[var(--color-fg-muted)]">
            {incident.title}
          </p>
        ) : null}
      </Link>
    </li>
  );
}

function EmptyRuns() {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)]/30 px-6 py-12 text-center">
      <p className="font-mono-label text-[var(--color-fg-dim)]">no runs yet</p>
      <p className="max-w-[36ch] font-light text-[14.5px] text-[var(--color-fg-muted)]">
        Page Argus from the status board to launch an investigation. Past runs accumulate here.
      </p>
    </div>
  );
}

function statusVisual(status: IncidentSummary["status"]): { color: string; label: string } {
  switch (status) {
    case "running":
      return { color: "var(--color-primary)", label: "investigating" };
    case "failed_over":
      return { color: "var(--color-warn)", label: "failed over" };
    case "halted":
      return { color: "var(--color-danger)", label: "halted" };
    case "resolved":
      return { color: "var(--color-success)", label: "resolved" };
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
