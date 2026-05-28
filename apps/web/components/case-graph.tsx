"use client";
import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  BaseEdge,
  Controls,
  ConnectionMode,
  EdgeLabelRenderer,
  Handle,
  Position,
  getStraightPath,
  useInternalNode,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type EdgeProps,
  type InternalNode,
  type NodeProps,
} from "@xyflow/react";
import { getCaseGraph, getIngestStatus, type CaseGraph as CaseGraphData, type IngestStatus } from "@/lib/api";

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

// Overshoot-and-settle. The keyed wrapper remounts whenever `bounce` changes
// (on drag-stop) so the animation replays; it also runs once on mount as a
// pop-in. `transform-box: fill-box` keeps the scale centered on the pill.
const SETTLE = "cg-settle 440ms cubic-bezier(0.34, 1.56, 0.64, 1) both" as const;

function FocusNodeView({ data }: NodeProps) {
  const d = data as { label?: string; bounce?: number };
  return (
    <>
      <div
        key={d.bounce ?? 0}
        className="flex max-w-[230px] flex-col items-center gap-1 rounded-xl border border-[var(--color-primary)]/70 bg-[var(--color-primary-soft)]/35 px-4 py-2.5"
        style={{ boxShadow: "0 0 0 1px color-mix(in oklch, var(--color-primary) 35%, transparent), 0 0 36px -8px var(--color-primary)", animation: SETTLE }}
      >
        <span className="font-mono text-[9px] uppercase tracking-[0.24em] text-[var(--color-primary)]">this incident</span>
        <span className="text-center font-mono text-[12px] leading-tight text-[var(--color-fg)]">{String(d.label ?? "")}</span>
      </div>
      <Handle type="source" position={Position.Right} style={hiddenHandle} />
      <Handle type="target" position={Position.Left} style={hiddenHandle} />
    </>
  );
}

function RelatedNodeView({ data }: NodeProps) {
  const d = data as { label?: string; incidentId?: string; bounce?: number };
  return (
    <>
      <a
        key={d.bounce ?? 0}
        href={`/incident/${d.incidentId}`}
        target="_blank"
        rel="noreferrer"
        className="group flex max-w-[180px] flex-col gap-0.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]/90 px-3 py-2 text-left transition-[border-color,background-color] duration-200 hover:border-[var(--color-primary)]/60 hover:bg-[var(--color-surface-2)]"
        style={{ animation: SETTLE }}
      >
        <span className="truncate text-[12.5px] font-light leading-tight text-[var(--color-fg)]">{d.label}</span>
        <span className="truncate font-mono text-[9.5px] uppercase tracking-[0.14em] text-[var(--color-fg-dim)]">
          {d.incidentId}
        </span>
      </a>
      <Handle type="target" position={Position.Left} style={hiddenHandle} />
      <Handle type="source" position={Position.Right} style={hiddenHandle} />
    </>
  );
}

const nodeTypes = { focus: FocusNodeView, related: RelatedNodeView };

// --- floating edges -------------------------------------------------------
// Standard React Flow technique: instead of anchoring to a fixed handle, find
// where the straight line between two node centers crosses the source node's
// border. That makes each edge leave from whichever side faces its target.

function nodeBorderPoint(node: InternalNode, other: InternalNode): { x: number; y: number } {
  const w = (node.measured.width ?? 0) / 2;
  const h = (node.measured.height ?? 0) / 2;
  const cx = node.internals.positionAbsolute.x + w;
  const cy = node.internals.positionAbsolute.y + h;
  const ox = other.internals.positionAbsolute.x + (other.measured.width ?? 0) / 2;
  const oy = other.internals.positionAbsolute.y + (other.measured.height ?? 0) / 2;

  const xx = (ox - cx) / (2 * w || 1) - (oy - cy) / (2 * h || 1);
  const yy = (ox - cx) / (2 * w || 1) + (oy - cy) / (2 * h || 1);
  const a = 1 / (Math.abs(xx) + Math.abs(yy) || 1);
  const xx3 = a * xx;
  const yy3 = a * yy;
  return { x: w * (xx3 + yy3) + cx, y: h * (-xx3 + yy3) + cy };
}

function FloatingEdge({ id, source, target, style, data }: EdgeProps) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  if (!sourceNode || !targetNode) return null;
  const s = nodeBorderPoint(sourceNode, targetNode);
  const t = nodeBorderPoint(targetNode, sourceNode);
  const [path, labelX, labelY] = getStraightPath({ sourceX: s.x, sourceY: s.y, targetX: t.x, targetY: t.y });
  const label = (data as { label?: string } | undefined)?.label;
  return (
    <>
      <BaseEdge id={id} path={path} style={style} />
      {label ? (
        <EdgeLabelRenderer>
          <div
            className="pointer-events-none absolute max-w-[170px] rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-center font-mono text-[10px] leading-[1.35] text-[var(--color-fg-dim)]"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

const edgeTypes = { floating: FloatingEdge };

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
      type: "floating",
      data: { label: r.shared.length > 0 ? describeShared(r.shared) : undefined },
      style: { stroke: "var(--color-border-strong)", strokeWidth: 1, strokeDasharray: "2 5" },
    });
  });
  return { nodes, edges };
}

export function CaseGraph({ incidentId, height = 360, halted = false }: { incidentId: string; height?: number | string; halted?: boolean }) {
  const [data, setData] = useState<CaseGraphData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [ingest, setIngest] = useState<IngestStatus | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // Fetch the case graph; null = not in KB yet (ingest still running).
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async (initial: boolean) => {
      if (initial) setLoading(true);
      try {
        const g = await getCaseGraph(incidentId);
        if (!alive) return;
        if (g && g.nodes.length > 0) {
          setData(g);
          setIngest(null);
          setLoading(false);
          return;
        }
        // Halted investigations don't get ingested — no point polling.
        if (halted) {
          setIngest(null);
          setLoading(false);
          return;
        }
        // Graph not ready yet — check ingest status and reschedule.
        const s = await getIngestStatus(incidentId).catch(() => null);
        if (!alive) return;
        setIngest(s);
        setLoading(false);
        if (s?.state === "failed") {
          setErr(s.last_error || "ingest failed");
          return;
        }
        timer = setTimeout(() => tick(false), 2000);
      } catch (e) {
        if (!alive) return;
        setErr((e as Error).message);
        setLoading(false);
      }
    };

    setErr(null);
    void tick(true);
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [incidentId, halted]);

  const built = useMemo(() => (data ? buildGraph(derive(data)) : null), [data]);

  useEffect(() => {
    if (!built) return;
    setNodes(built.nodes);
    setEdges(built.edges);
  }, [built, setNodes, setEdges]);

  // Bump the dragged node's `bounce` so its view remounts and replays the
  // overshoot-settle animation where it was dropped.
  const onNodeDragStop = useCallback(
    (_e: unknown, node: Node) => {
      setNodes((ns) =>
        ns.map((n) =>
          n.id === node.id ? { ...n, data: { ...n.data, bounce: (Number(n.data.bounce) || 0) + 1 } } : n,
        ),
      );
    },
    [setNodes],
  );

  const ingestActive = ingest && (ingest.state === "queued" || ingest.state === "running");
  const state: "loading" | "error" | "ingesting" | "empty" | "ready" = loading
    ? "loading"
    : err
      ? "error"
      : !data || data.nodes.length === 0
        ? ingestActive
          ? "ingesting"
          : "empty"
        : "ready";

  return (
    <div
      style={{ height }}
      className="relative overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)]/60"
    >
      {state === "loading" ? <Centered>loading case graph…</Centered> : null}
      {state === "error" ? <Centered>case graph unavailable: {err}</Centered> : null}
      {state === "ingesting" ? <IngestProgress status={ingest!} /> : null}
      {state === "empty" ? (
        <Centered>
          {halted
            ? "Investigation failed — not saved to knowledge base"
            : "Incident seeding — knowledge graph will populate shortly"}
        </Centered>
      ) : null}

      {state === "ready" ? (
        <>
        <style>{`@keyframes cg-settle { 0% { transform: scale(0.82); } 60% { transform: scale(1.08); } 80% { transform: scale(0.97); } 100% { transform: scale(1); } }`}</style>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeDragStop={onNodeDragStop}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          connectionMode={ConnectionMode.Loose}
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
              incident seeding — linked cases will appear shortly
            </span>
          ) : null}
        </ReactFlow>
        </>
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

// Live ingest counter shown while Graphiti is extracting entities for this
// incident. `started_at` is unix-seconds from the KB; we tick locally so the
// counter updates every second between status polls.
function IngestProgress({ status }: { status: IngestStatus }) {
  const startedAt = status.started_at ?? null;
  const seedElapsed = status.elapsed_s ?? 0;
  const [now, setNow] = useState(() => Date.now() / 1000);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() / 1000), 1000);
    return () => clearInterval(id);
  }, []);
  const elapsed = startedAt ? Math.max(0, now - startedAt) : seedElapsed;
  const calls = status.extraction_calls ?? 0;

  return (
    <div className="flex h-full items-center justify-center px-6">
      <div className="flex flex-col items-center gap-5">
        <div className="font-mono-label text-[var(--color-fg-muted)]">
          ingesting incident into knowledge graph
        </div>
        <div className="flex flex-col gap-2 font-mono text-[12.5px] text-[var(--color-fg)]">
          <Counter label="extractions" value={`${calls}`} />
          <Counter label="elapsed" value={`${Math.round(elapsed)}s`} />
        </div>
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-fg-dim)]">
          crusoe · nemotron-3-nano · graphiti
        </div>
      </div>
      <style>{`@keyframes cg-pulse { 0%,100% { opacity: 0.35 } 50% { opacity: 1 } }`}</style>
    </div>
  );
}

function Counter({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <span
        className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-primary)]"
        style={{ animation: "cg-pulse 1.6s ease-in-out infinite" }}
      />
      <span className="w-32 text-[var(--color-fg-muted)]">{label}</span>
      <span className="tabular-nums text-[var(--color-fg)]">{value}</span>
    </div>
  );
}
