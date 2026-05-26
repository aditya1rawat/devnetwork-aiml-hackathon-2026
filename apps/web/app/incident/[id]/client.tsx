"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getStoredIncidentReport, listIncidents, type StoredIncidentReport } from "@/lib/api";
import { LiveIncidentView } from "./live-view";
import { ArchivedIncidentView } from "./archived-view";

type Mode =
  | { kind: "loading" }
  | { kind: "live" }
  | { kind: "archived"; report: StoredIncidentReport }
  | { kind: "unknown" }
  | { kind: "error"; message: string };

/** Decides which view to render for an incident URL.
 *
 * Priority: an incident in active orchestrator memory always wins — the live
 * view shows the in-flight run AND its final report once done. Only when the
 * id isn't in memory do we look in the KB and switch to read-only archive
 * mode. This prevents clicking a seeded-incident link from spinning up a new
 * investigation against that id.
 */
export function IncidentClient({ id }: { id: string }) {
  const [mode, setMode] = useState<Mode>({ kind: "loading" });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [incidents, report] = await Promise.all([
          listIncidents().catch(() => []),
          getStoredIncidentReport(id).catch(() => null),
        ]);
        if (!alive) return;
        const live = incidents.some((i) => i.id === id);
        if (live) {
          setMode({ kind: "live" });
        } else if (report !== null) {
          setMode({ kind: "archived", report });
        } else {
          setMode({ kind: "unknown" });
        }
      } catch (err) {
        if (!alive) return;
        setMode({ kind: "error", message: (err as Error).message });
      }
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  if (mode.kind === "loading") return <CenteredMessage label="loading" />;
  if (mode.kind === "live") return <LiveIncidentView id={id} />;
  if (mode.kind === "archived") return <ArchivedIncidentView id={id} report={mode.report} />;
  if (mode.kind === "error") return <CenteredMessage label="error" detail={mode.message} />;
  return <UnknownIncident id={id} />;
}

function CenteredMessage({ label, detail }: { label: string; detail?: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--color-bg)] text-[var(--color-fg)]">
      <div className="flex flex-col items-center gap-3">
        <span className="font-mono-label text-[var(--color-fg-dim)]">{label}</span>
        {detail ? <span className="font-mono text-[12px] text-[var(--color-fg-muted)]">{detail}</span> : null}
      </div>
    </main>
  );
}

function UnknownIncident({ id }: { id: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--color-bg)] text-[var(--color-fg)]">
      <div className="flex max-w-[44ch] flex-col items-center gap-4 px-6 text-center">
        <span className="font-mono-label text-[var(--color-fg-dim)]">incident not found</span>
        <h1 className="font-display text-[28px] font-extralight tracking-tight leading-[1.15]">
          No record of <span className="font-mono text-[20px]">{id}</span>.
        </h1>
        <p className="text-[14.5px] font-light leading-[1.55] text-[var(--color-fg-muted)]">
          This id is neither running on the orchestrator nor stored in the knowledge base. Launch a fresh scenario from the incidents page.
        </p>
        <Link
          href="/incidents"
          className="mt-2 inline-flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]/60 px-3 py-1.5 font-mono-label text-[var(--color-fg)] hover:bg-[var(--color-surface-2)]/60"
        >
          ← incidents
        </Link>
      </div>
    </main>
  );
}
