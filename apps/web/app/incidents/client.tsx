"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { listScenarios, listIncidents, startScenario, type DemoScenario, type IncidentSummary } from "@/lib/api";

export function IncidentsClient() {
  const router = useRouter();
  const [scenarios, setScenarios] = useState<DemoScenario[] | null>(null);
  const [incidents, setIncidents] = useState<IncidentSummary[] | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    listScenarios().then(setScenarios).catch((e) => setErr(String(e)));
  }, []);

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

  async function launch(scenario: string) {
    setPending(scenario);
    setErr(null);
    try {
      const { id } = await startScenario(scenario);
      router.push(`/incident/${id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setPending(null);
    }
  }

  return (
    <main className="min-h-screen bg-[var(--color-bg)] text-[var(--color-fg)]">
      <Topbar />

      <div className="mx-auto w-full max-w-[1100px] px-6 py-10 space-y-12">
        <header className="space-y-3">
          <p className="font-mono-label text-[var(--color-fg-dim)]">incidents</p>
          <h1 className="font-display text-[44px] font-extralight tracking-tight leading-[1.05]">
            Browse <span className="font-serif-display italic text-[var(--color-fg-muted)]">runs</span>.
          </h1>
          <p className="max-w-[52ch] text-[15.5px] font-light leading-[1.55] text-[var(--color-fg-muted)]">
            Pick a chaos scenario to launch a fresh investigation, or jump back into a past run.
          </p>
        </header>

        <section className="space-y-4">
          <SectionLabel label="demoable scenarios" />
          {scenarios === null ? (
            <p className="font-mono-meta text-[var(--color-fg-dim)]">loading…</p>
          ) : (
            <ul className="grid gap-4 md:grid-cols-2">
              {scenarios.map((s) => (
                <ScenarioCard key={s.id} scenario={s} pending={pending === s.id} disabled={pending !== null} onLaunch={() => launch(s.id)} />
              ))}
            </ul>
          )}
          {err ? <p className="font-mono-meta text-[var(--color-danger)]">{err}</p> : null}
        </section>

        <section className="space-y-4">
          <div className="flex items-baseline justify-between">
            <SectionLabel label="past runs" />
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
          <Link href="/incidents" className="font-mono-meta text-[var(--color-fg)]">
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

function ScenarioCard({
  scenario,
  pending,
  disabled,
  onLaunch,
}: {
  scenario: DemoScenario;
  pending: boolean;
  disabled: boolean;
  onLaunch: () => void;
}) {
  return (
    <li className="flex flex-col gap-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[18px] font-light tracking-tight text-[var(--color-fg)]">{scenario.title}</h3>
        <span className="rounded-md border border-[var(--color-border)] px-2 py-0.5 font-mono text-[10.5px] tracking-[0.18em] uppercase text-[var(--color-fg-dim)]">
          {scenario.chaosType}
        </span>
      </div>
      <p className="text-[14.5px] font-light leading-[1.55] text-[var(--color-fg-muted)]">{scenario.blurb}</p>
      <dl className="grid grid-cols-3 gap-3 border-t border-[var(--color-border)] pt-3 font-mono text-[11.5px] tnum">
        <Meta label="target" value={scenario.target} />
        <Meta label="warmup" value={`${scenario.warmupS}s`} />
        <Meta label="duration" value={`${scenario.durationS}s`} />
      </dl>
      <button
        type="button"
        onClick={onLaunch}
        disabled={disabled}
        className="mt-1 flex items-center justify-between gap-3 rounded-md border border-[var(--color-primary)]/45 bg-[var(--color-primary-soft)]/20 px-4 py-2.5 text-left transition-colors hover:bg-[var(--color-primary-soft)]/35 disabled:cursor-not-allowed disabled:opacity-55"
      >
        <span className="font-mono text-[12px] tracking-[0.05em] text-[var(--color-primary)]">
          {pending ? "starting…" : "launch investigation"}
        </span>
        <span className="font-mono text-[12px] text-[var(--color-fg-dim)]">↗</span>
      </button>
    </li>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="font-mono-label text-[var(--color-fg-dim)]">{label}</dt>
      <dd className="text-[var(--color-fg)]">{value}</dd>
    </div>
  );
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

function EmptyRuns() {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)]/30 px-6 py-12 text-center">
      <p className="font-mono-label text-[var(--color-fg-dim)]">no runs yet</p>
      <p className="max-w-[36ch] font-light text-[14.5px] text-[var(--color-fg-muted)]">
        Launch a scenario above to spin up the first investigation. Past runs accumulate here.
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
