"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { getCaseGraph, type CaseGraph as CaseGraphData } from "@/lib/api";

/** Prior-cases constellation.
 *
 * The KB hands back a 2-hop subgraph around the focus incident. graphiti's
 * extraction is loose: related cases show up as extracted `Incident` entity
 * nodes (not separate episodes), each tagged with a `meta.incident_id`. Many
 * are self-referential (they carry the focus's own id) or duplicated. So we
 * collapse the subgraph: group by `incident_id`, drop the focus's own id, and
 * draw one orbiting node per distinct related case. Shared services/causes
 * become the edge label rather than their own nodes.
 */

interface RelatedCase {
  incidentId: string;
  label: string;
  shared: string[];
}

interface Derived {
  focusLabel: string;
  related: RelatedCase[];
}

function bestLabel(candidates: string[], incidentId: string): string {
  // Prefer a human title (has a space, isn't just the id echoed back).
  const title = candidates.find((c) => c.includes(" ") && !c.includes(incidentId));
  return title ?? incidentId;
}

function derive(data: CaseGraphData): Derived {
  const byId = new Map(data.nodes.map((n) => [n.id, n]));
  const adj = new Map<string, Set<string>>();
  for (const n of data.nodes) adj.set(n.id, new Set());
  for (const e of data.edges) {
    adj.get(e.source)?.add(e.target);
    adj.get(e.target)?.add(e.source);
  }

  const focus = byId.get(data.focus_id);
  const focusIncidentId = String(focus?.meta?.incident_id ?? "");
  // Entities the focus mentions (services, root causes, remediations) — the
  // pool of things a related case can "share" with this one.
  const focusEntityIds = [...(adj.get(data.focus_id) ?? [])].filter(
    (id) => byId.get(id)?.type !== "incident",
  );
  const focusEntityLabels = new Set(
    focusEntityIds.map((id) => byId.get(id)?.label).filter(Boolean) as string[],
  );

  // Group incident-typed nodes by their real incident_id.
  const groups = new Map<string, { labels: string[]; shared: Set<string> }>();
  for (const n of data.nodes) {
    if (n.type !== "incident") continue;
    const iid = String(n.meta?.incident_id ?? "");
    if (!iid || iid === focusIncidentId) continue; // drop self-referential entities
    const g = groups.get(iid) ?? { labels: [], shared: new Set<string>() };
    g.labels.push(n.label);
    for (const nb of adj.get(n.id) ?? []) {
      const lbl = byId.get(nb)?.label;
      if (lbl && focusEntityLabels.has(lbl)) g.shared.add(lbl);
    }
    groups.set(iid, g);
  }

  const related: RelatedCase[] = [...groups.entries()]
    .map(([incidentId, g]) => ({
      incidentId,
      label: bestLabel(g.labels, incidentId),
      shared: [...g.shared],
    }))
    .sort((a, b) => b.shared.length - a.shared.length)
    .slice(0, 8);

  return { focusLabel: focusIncidentId || (focus?.label ?? "this incident"), related };
}

function useSize(ref: React.RefObject<HTMLDivElement | null>) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const r = entry.contentRect;
      setSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

export function CaseGraph({ incidentId, height = 360 }: { incidentId: string; height?: number | string }) {
  const [data, setData] = useState<CaseGraphData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Container is always mounted (states render as overlays inside it), so the
  // ResizeObserver attaches on first paint instead of racing the fetch.
  const containerRef = useRef<HTMLDivElement>(null);
  const { w, h } = useSize(containerRef);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr(null);
    getCaseGraph(incidentId)
      .then((g) => {
        if (!alive) return;
        setData(g);
        setLoading(false);
      })
      .catch((e: Error) => {
        if (!alive) return;
        setErr(e.message);
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [incidentId]);

  const derived = useMemo(() => (data ? derive(data) : null), [data]);

  const layout = useMemo(() => {
    if (!derived || w === 0 || h === 0) return null;
    const cx = w / 2;
    const cy = h / 2;
    const n = derived.related.length;
    // Elliptical orbit: the panel is wide and short, so a circle would cram
    // nodes vertically and collide left/right pills with the center. Spread
    // wide on x, modestly on y. Margins keep ~176px pills inside the frame.
    const rx = Math.max(150, Math.min(w * 0.40, w / 2 - 100));
    const ry = Math.max(70, Math.min(h * 0.38, h / 2 - 46));
    const nodes = derived.related.map((r, i) => {
      const angle = -Math.PI / 2 + (i * 2 * Math.PI) / Math.max(n, 1);
      return { ...r, x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) };
    });
    return { cx, cy, nodes };
  }, [derived, w, h]);

  const state: "loading" | "error" | "empty" | "ready" = loading
    ? "loading"
    : err
      ? "error"
      : !data || data.nodes.length === 0
        ? "empty"
        : "ready";

  return (
    <div
      ref={containerRef}
      style={{ height }}
      className="relative overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)]/60"
    >
      {state === "loading" ? <Centered>loading case graph…</Centered> : null}
      {state === "error" ? <Centered>case graph unavailable: {err}</Centered> : null}
      {state === "empty" ? <Centered>no prior cases yet — this incident will seed future runs</Centered> : null}

      {state === "ready" && layout ? (
        <>
          <svg className="absolute inset-0 h-full w-full" aria-hidden>
            <defs>
              <radialGradient id="cg-focus-glow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.18" />
                <stop offset="55%" stopColor="var(--color-primary)" stopOpacity="0.05" />
                <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0" />
              </radialGradient>
            </defs>
            <circle cx={layout.cx} cy={layout.cy} r={Math.max(layout.cx, layout.cy)} fill="url(#cg-focus-glow)" />
            {layout.nodes.map((node) => (
              <line
                key={`edge-${node.incidentId}`}
                x1={layout.cx}
                y1={layout.cy}
                x2={node.x}
                y2={node.y}
                stroke="var(--color-border-strong)"
                strokeWidth={1}
                strokeDasharray="2 5"
                strokeLinecap="round"
              />
            ))}
          </svg>

          {layout.nodes.map((node) => {
            const chip = node.shared[0];
            if (!chip) return null;
            const lx = layout.cx + (node.x - layout.cx) * 0.62;
            const ly = layout.cy + (node.y - layout.cy) * 0.62;
            const extra = node.shared.length - 1;
            return (
              <span
                key={`label-${node.incidentId}`}
                className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-0.5 font-mono text-[10px] text-[var(--color-fg-dim)]"
                style={{ left: lx, top: ly }}
              >
                {chip}
                {extra > 0 ? <span className="opacity-60"> +{extra}</span> : null}
              </span>
            );
          })}

          {layout.nodes.map((node) => (
            <a
              key={`node-${node.incidentId}`}
              href={`/incident/${node.incidentId}`}
              target="_blank"
              rel="noreferrer"
              className="group absolute flex max-w-[176px] -translate-x-1/2 -translate-y-1/2 flex-col gap-0.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]/90 px-3 py-2 text-left transition-[transform,border-color,background-color] duration-200 hover:border-[var(--color-primary)]/60 hover:bg-[var(--color-surface-2)]"
              style={{ left: node.x, top: node.y, transitionTimingFunction: "cubic-bezier(0.22,1,0.36,1)" }}
            >
              <span className="truncate text-[12.5px] font-light leading-tight text-[var(--color-fg)]">
                {node.label}
              </span>
              <span className="truncate font-mono text-[9.5px] uppercase tracking-[0.14em] text-[var(--color-fg-dim)]">
                {node.incidentId}
              </span>
            </a>
          ))}

          <FocusNode label={derived!.focusLabel} x={layout.cx} y={layout.cy} />

          {derived!.related.length === 0 ? (
            <span className="absolute bottom-3 left-1/2 -translate-x-1/2 font-mono-meta text-[var(--color-fg-dim)]">
              no linked prior cases yet
            </span>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function FocusNode({ label, x, y }: { label: string; x: number; y: number }) {
  return (
    <div className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2" style={{ left: x, top: y }}>
      <div
        className="relative flex max-w-[230px] flex-col items-center gap-1 rounded-xl border border-[var(--color-primary)]/70 bg-[var(--color-primary-soft)]/35 px-4 py-2.5"
        style={{ boxShadow: "0 0 0 1px color-mix(in oklch, var(--color-primary) 35%, transparent), 0 0 36px -8px var(--color-primary)" }}
      >
        <span className="font-mono text-[9px] uppercase tracking-[0.24em] text-[var(--color-primary)]">this incident</span>
        <span className="text-center font-mono text-[12px] leading-tight text-[var(--color-fg)]">{label}</span>
      </div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center px-6 text-center font-mono-label text-[var(--color-fg-dim)]">
      {children}
    </div>
  );
}
