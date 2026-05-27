"use client";
import "@xyflow/react/dist/style.css";
import { useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeProps,
} from "@xyflow/react";
import { getCaseGraph, type CaseGraph as CaseGraphData } from "@/lib/api";

/** Prior-cases constellation, interactive.
 *
 * The KB hands back a 2-hop subgraph around the focus incident. graphiti's
 * extraction is loose: related cases show up as extracted `Incident` entity
 * nodes (not separate episodes), each tagged with a `meta.incident_id`. Many
 * are self-referential or duplicated. So we collapse the subgraph: group by
 * `incident_id`, drop the focus's own id, and lay one orbiting node per
 * distinct related case around a focus center. Shared services/causes become
 * the edge label. React Flow gives free pan, zoom, and node dragging while we
 * supply custom node renderers that keep the bespoke pill styling.
 */

interface SharedEntity {
  label: string;
  type: string;
}

interface RelatedCase {
  incidentId: string;
  label: string;
  shared: SharedEntity[];
}

interface Derived {
  focusLabel: string;
  related: RelatedCase[];
}

const RELATION_WORD: Record<string, string> = {
  service: "service",
  root_cause: "root cause",
  remediation: "fix",
  other: "entity",
};

function describeShared(shared: SharedEntity[]): string {
  const order = ["service", "root_cause", "remediation", "other"];
  const byType = new Map<string, string[]>();
  for (const s of shared) {
    const arr = byType.get(s.type) ?? [];
    if (!arr.includes(s.label)) arr.push(s.label);
    byType.set(s.type, arr);
  }
  return order
    .filter((t) => byType.has(t))
    .map((t) => `${RELATION_WORD[t] ?? t}: ${byType.get(t)!.join(", ")}`)
    .join(" · ");
}

function bestLabel(candidates: string[], incidentId: string): string {
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
  const focusEntityIds = [...(adj.get(data.focus_id) ?? [])].filter(
    (id) => byId.get(id)?.type !== "incident",
  );
  const focusEntityLabels = new Set(
    focusEntityIds.map((id) => byId.get(id)?.label).filter(Boolean) as string[],
  );

  const groups = new Map<string, { labels: string[]; shared: Map<string, SharedEntity> }>();
  for (const n of data.nodes) {
    if (n.type !== "incident") continue;
    const iid = String(n.meta?.incident_id ?? "");
    if (!iid || iid === focusIncidentId) continue;
    const g = groups.get(iid) ?? { labels: [], shared: new Map<string, SharedEntity>() };
    g.labels.push(n.label);
    for (const nb of adj.get(n.id) ?? []) {
      const node = byId.get(nb);
      const lbl = node?.label;
      if (lbl && focusEntityLabels.has(lbl)) g.shared.set(lbl, { label: lbl, type: node!.type });
    }
    groups.set(iid, g);
  }

  const related: RelatedCase[] = [...groups.entries()]
    .map(([incidentId, g]) => ({
      incidentId,
      label: bestLabel(g.labels, incidentId),
      shared: [...g.shared.values()],
    }))
    .sort((a, b) => b.shared.length - a.shared.length)
    .slice(0, 8);

  return { focusLabel: focusIncidentId || (focus?.label ?? "this incident"), related };
}

// --- custom nodes ---------------------------------------------------------

const hiddenHandle = { opacity: 0, width: 1, height: 1, minWidth: 1, minHeight: 1, border: "none" } as const;

function FocusNodeView({ data }: NodeProps) {
  const label = String((data as { label?: string }).label ?? "");
  return (
    <div
      className="flex max-w-[230px] flex-col items-center gap-1 rounded-xl border border-[var(--color-primary)]/70 bg-[var(--color-primary-soft)]/35 px-4 py-2.5"
      style={{ boxShadow: "0 0 0 1px color-mix(in oklch, var(--color-primary) 35%, transparent), 0 0 36px -8px var(--color-primary)" }}
    >
      <span className="font-mono text-[9px] uppercase tracking-[0.24em] text-[var(--color-primary)]">this incident</span>
      <span className="text-center font-mono text-[12px] leading-tight text-[var(--color-fg)]">{label}</span>
      <Handle type="source" position={Position.Right} style={hiddenHandle} />
      <Handle type="target" position={Position.Left} style={hiddenHandle} />
    </div>
  );
}

function RelatedNodeView({ data }: NodeProps) {
  const d = data as { label?: string; incidentId?: string };
  return (
    <a
      href={`/incident/${d.incidentId}`}
      target="_blank"
      rel="noreferrer"
      className="group flex max-w-[180px] flex-col gap-0.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]/90 px-3 py-2 text-left transition-[border-color,background-color] duration-200 hover:border-[var(--color-primary)]/60 hover:bg-[var(--color-surface-2)]"
    >
      <span className="truncate text-[12.5px] font-light leading-tight text-[var(--color-fg)]">{d.label}</span>
      <span className="truncate font-mono text-[9.5px] uppercase tracking-[0.14em] text-[var(--color-fg-dim)]">
        {d.incidentId}
      </span>
      <Handle type="target" position={Position.Left} style={hiddenHandle} />
      <Handle type="source" position={Position.Right} style={hiddenHandle} />
    </a>
  );
}

const nodeTypes = { focus: FocusNodeView, related: RelatedNodeView };

function buildGraph(derived: Derived): { nodes: Node[]; edges: Edge[] } {
  const n = derived.related.length;
  // Virtual radial canvas; React Flow's fitView scales it to the container.
  const rx = 360;
  const ry = 230;
  const nodes: Node[] = [
    { id: "focus", type: "focus", position: { x: 0, y: 0 }, data: { label: derived.focusLabel }, draggable: true },
  ];
  const edges: Edge[] = [];
  derived.related.forEach((r, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / Math.max(n, 1);
    nodes.push({
      id: r.incidentId,
      type: "related",
      position: { x: rx * Math.cos(angle), y: ry * Math.sin(angle) },
      data: { label: r.label, incidentId: r.incidentId },
      draggable: true,
    });
    edges.push({
      id: `edge-${r.incidentId}`,
      source: "focus",
      target: r.incidentId,
      label: r.shared.length > 0 ? describeShared(r.shared) : undefined,
      style: { stroke: "var(--color-border-strong)", strokeWidth: 1, strokeDasharray: "2 5" },
      labelStyle: { fontFamily: "var(--font-mono)", fontSize: 10, fill: "var(--color-fg-dim)" },
      labelBgStyle: { fill: "var(--color-bg)", fillOpacity: 0.95 },
      labelBgPadding: [6, 3],
      labelBgBorderRadius: 6,
    });
  });
  return { nodes, edges };
}

export function CaseGraph({ incidentId, height = 360 }: { incidentId: string; height?: number | string }) {
  const [data, setData] = useState<CaseGraphData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

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

  const built = useMemo(() => (data ? buildGraph(derive(data)) : null), [data]);

  useEffect(() => {
    if (!built) return;
    setNodes(built.nodes);
    setEdges(built.edges);
  }, [built, setNodes, setEdges]);

  const state: "loading" | "error" | "empty" | "ready" = loading
    ? "loading"
    : err
      ? "error"
      : !data || data.nodes.length === 0
        ? "empty"
        : "ready";

  return (
    <div
      style={{ height }}
      className="relative overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)]/60"
    >
      {state === "loading" ? <Centered>loading case graph…</Centered> : null}
      {state === "error" ? <Centered>case graph unavailable: {err}</Centered> : null}
      {state === "empty" ? <Centered>no prior cases yet — this incident will seed future runs</Centered> : null}

      {state === "ready" ? (
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.25 }}
          minZoom={0.3}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
          nodesConnectable={false}
          elementsSelectable
          panOnScroll
          className="[&_.react-flow__edge-text]:font-mono"
        >
          <Background gap={18} color="var(--color-border)" />
          <Controls showInteractive={false} className="!border-[var(--color-border)] [&_button]:!border-[var(--color-border)] [&_button]:!bg-[var(--color-surface)] [&_button]:!fill-[var(--color-fg-muted)]" />
          {nodes.length <= 1 ? (
            <span className="pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2 font-mono-meta text-[var(--color-fg-dim)]">
              no linked prior cases yet
            </span>
          ) : null}
        </ReactFlow>
      ) : null}
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
