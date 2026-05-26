"use client";
import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MarkerType,
  Position,
  type Edge,
  type Node,
} from "@xyflow/react";
import dagre from "dagre";
import { getCaseGraph, type CaseGraph as CaseGraphData } from "@/lib/api";

const NODE_W = 200;
const NODE_H = 56;

const TYPE_STYLE: Record<string, { bg: string; border: string; fg: string }> = {
  incident: { bg: "var(--color-primary-soft)", border: "var(--color-primary)", fg: "var(--color-fg)" },
  service: { bg: "var(--color-surface-2)", border: "var(--color-border)", fg: "var(--color-fg-muted)" },
  root_cause: { bg: "var(--color-warn-soft)", border: "var(--color-warn)", fg: "var(--color-fg)" },
  remediation: { bg: "var(--color-success-soft)", border: "var(--color-success)", fg: "var(--color-fg)" },
  other: { bg: "var(--color-surface)", border: "var(--color-border)", fg: "var(--color-fg-muted)" },
};

function layout(data: CaseGraphData): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "TB", ranksep: 60, nodesep: 30 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const n of data.nodes) g.setNode(n.id, { width: NODE_W, height: NODE_H });
  for (const e of data.edges) g.setEdge(e.source, e.target);
  dagre.layout(g);

  const nodes: Node[] = data.nodes.map((n) => {
    const pos = g.node(n.id);
    const isFocus = n.id === data.focus_id;
    const s = TYPE_STYLE[n.type] ?? TYPE_STYLE.other;
    return {
      id: n.id,
      position: { x: pos.x - NODE_W / 2, y: pos.y - NODE_H / 2 },
      data: { label: n.label, kind: n.type, meta: n.meta },
      style: {
        width: NODE_W,
        padding: "8px 12px",
        background: s.bg,
        border: `${isFocus ? 2 : 1}px solid ${s.border}`,
        borderRadius: 8,
        color: s.fg,
        fontSize: 12,
        fontFamily: "var(--font-sans)",
        boxShadow: isFocus ? "0 0 0 3px color-mix(in oklch, var(--color-primary) 25%, transparent)" : undefined,
      },
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
    };
  });

  const edges: Edge[] = data.edges.map((e, i) => ({
    id: `e-${i}-${e.source}-${e.target}`,
    source: e.source,
    target: e.target,
    label: e.label,
    labelStyle: { fontSize: 10, fill: "var(--color-fg-dim)" },
    style: { stroke: "var(--color-border)", strokeWidth: 1 },
    markerEnd: { type: MarkerType.ArrowClosed, color: "var(--color-border)" },
  }));

  return { nodes, edges };
}

export function CaseGraph({ incidentId, height = 360 }: { incidentId: string; height?: number | string }) {
  const [data, setData] = useState<CaseGraphData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
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

  const { nodes, edges } = useMemo(() => (data ? layout(data) : { nodes: [], edges: [] }), [data]);

  const onNodeClick = useCallback(
    (_evt: unknown, node: Node) => {
      if (node.data?.kind !== "incident") return;
      const meta = node.data?.meta as { incident_id?: string } | undefined;
      const id = String(meta?.incident_id ?? "");
      if (!id || id === incidentId) return;
      window.open(`/incident/${id}`, "_blank");
    },
    [incidentId],
  );

  if (loading) {
    return <div style={{ height }} className="flex items-center justify-center font-mono-label text-[var(--color-fg-dim)]">loading case graph…</div>;
  }
  if (err) {
    return <div style={{ height }} className="flex items-center justify-center font-mono-label text-[var(--color-fg-dim)]">case graph unavailable: {err}</div>;
  }
  if (!data || data.nodes.length === 0) {
    return <div style={{ height }} className="flex items-center justify-center font-mono-label text-[var(--color-fg-dim)]">no prior cases yet — this incident will seed future runs</div>;
  }

  return (
    <div style={{ height }} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)]/60">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodeClick={onNodeClick}
        fitView
        proOptions={{ hideAttribution: true }}
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable
      >
        <Background gap={16} color="var(--color-border)" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
