"use client";
import { useMemo } from "react";
import type { StreamEvent } from "@/lib/types";

interface Row {
  incidentId: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function looksLikeIncidentId(s: string): boolean {
  return s.length > 0 && !UUID_RE.test(s);
}

export function RelatedCasesList({ events }: { events: StreamEvent[] }) {
  const rows = useMemo<Row[]>(() => {
    const seen = new Set<string>();
    const out: Row[] = [];
    for (const e of events) {
      if (e.type !== "kb_lookup_result") continue;
      const ids = (e.data as { top_ids?: string[] }).top_ids ?? [];
      for (const id of ids) {
        // Skip stale events from before the MCP server resolved entity UUIDs
        // back to incident slugs. UUID-shaped ids never route to a real
        // incident, so showing them as links is worse than showing nothing.
        if (!looksLikeIncidentId(id)) continue;
        if (seen.has(id)) continue;
        seen.add(id);
        out.push({ incidentId: id });
      }
    }
    return out;
  }, [events]);

  if (rows.length === 0) return null;

  return (
    <>
      <h4 className="mb-3 mt-6 font-mono-label text-[var(--color-fg-dim)]">consulted this run</h4>
      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.incidentId} className="flex items-baseline gap-3">
            <span className="font-mono-label text-[var(--color-fg-dim)]">↳</span>
            <a
              href={`/incident/${r.incidentId}`}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-[13px] text-[var(--color-fg-muted)] underline-offset-4 hover:underline hover:text-[var(--color-fg)]"
            >
              {r.incidentId}
            </a>
          </li>
        ))}
      </ul>
    </>
  );
}
