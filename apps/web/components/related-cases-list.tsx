"use client";
import { useEffect, useState } from "react";
import { getCaseGraph } from "@/lib/api";

interface Row {
  incidentId: string;
  label: string;
}

export function RelatedCasesList({ incidentId }: { incidentId: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    let alive = true;
    getCaseGraph(incidentId).then((g) => {
      if (!alive || !g) return;
      const cases = g.nodes
        .filter((n) => n.type === "incident" && n.id !== g.focus_id)
        .map<Row>((n) => ({
          incidentId: String(n.meta?.incident_id ?? n.id),
          label: n.label,
        }));
      setRows(cases);
    });
    return () => {
      alive = false;
    };
  }, [incidentId]);

  if (!rows || rows.length === 0) return null;

  return (
    <ul className="mt-4 space-y-2">
      {rows.map((r) => (
        <li key={r.incidentId} className="flex items-baseline gap-3">
          <span className="font-mono-label text-[var(--color-fg-dim)]">↳</span>
          <a
            href={`/incident/${r.incidentId}`}
            target="_blank"
            rel="noreferrer"
            className="text-[14.5px] font-light text-[var(--color-fg-muted)] underline-offset-4 hover:underline hover:text-[var(--color-fg)]"
          >
            {r.label}
          </a>
        </li>
      ))}
    </ul>
  );
}
