export interface IncidentBundle {
  incident_id: string;
  title: string;
  report_md: string;
  scenario: string | null;
  failed_over: boolean;
  severity: "sev1" | "sev2" | "sev3";
  resolved_at: string;
  services_touched: string[];
  tool_log_digest: string;
}

export interface CaseGraphNode {
  id: string;
  type: "incident" | "service" | "root_cause" | "remediation" | "other";
  label: string;
  meta: Record<string, unknown>;
}

export interface CaseGraphEdge {
  source: string;
  target: string;
  type: string;
  label: string;
}

export interface CaseGraph {
  nodes: CaseGraphNode[];
  edges: CaseGraphEdge[];
  focus_id: string;
}

export class IncidentKbClient {
  constructor(private adminUrl: string) {}

  async ingest(bundle: IncidentBundle): Promise<{ job_id: string; status: string }> {
    const r = await fetch(`${this.adminUrl}/admin/ingest`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(bundle),
    });
    if (!r.ok) throw new Error(`kb ingest failed: ${r.status} ${await r.text()}`);
    return (await r.json()) as { job_id: string; status: string };
  }

  async reset(): Promise<void> {
    const r = await fetch(`${this.adminUrl}/admin/reset`, { method: "POST" });
    if (!r.ok) throw new Error(`kb reset failed: ${r.status}`);
  }

  async caseGraph(incidentId: string): Promise<CaseGraph> {
    const r = await fetch(`${this.adminUrl}/case-graph/${encodeURIComponent(incidentId)}`);
    if (!r.ok) throw new Error(`kb caseGraph failed: ${r.status}`);
    return (await r.json()) as CaseGraph;
  }
}
