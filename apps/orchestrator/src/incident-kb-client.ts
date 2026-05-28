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
  provenance?: "argus" | "historical";
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

export interface IngestStatus {
  incident_id: string;
  state: "unknown" | "queued" | "running" | "done" | "failed";
  job_id?: string;
  started_at?: number | null;
  finished_at?: number | null;
  extraction_calls?: number;
  elapsed_s?: number;
  last_error?: string | null;
}

export interface StoredIncidentReport {
  incident_id: string;
  title?: string;
  severity?: string;
  scenario?: string | null;
  failed_over?: boolean;
  resolved_at?: string;
  services_touched?: string[];
  tool_log_digest?: string;
  report_md: string;
  valid_at?: string;
  created_at?: string;
  source_description?: string;
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

  async ingestStatus(incidentId: string): Promise<IngestStatus> {
    const r = await fetch(`${this.adminUrl}/admin/ingest/status/${encodeURIComponent(incidentId)}`);
    if (!r.ok) throw new Error(`kb ingestStatus failed: ${r.status}`);
    return (await r.json()) as IngestStatus;
  }

  /** Returns the stored report, or null if the incident isn't in the KB. */
  async getReport(incidentId: string): Promise<StoredIncidentReport | null> {
    const r = await fetch(`${this.adminUrl}/incident/${encodeURIComponent(incidentId)}/report`);
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`kb getReport failed: ${r.status}`);
    return (await r.json()) as StoredIncidentReport;
  }

  async listIncidents(provenance?: "argus" | "historical"): Promise<StoredIncidentReport[]> {
    const url = new URL(`${this.adminUrl}/incidents`);
    if (provenance) url.searchParams.set("provenance", provenance);
    const r = await fetch(url.toString());
    if (!r.ok) throw new Error(`kb listIncidents failed: ${r.status}`);
    const j = (await r.json()) as { incidents: StoredIncidentReport[] };
    return j.incidents;
  }

  async backfillProvenance(historical: string[]): Promise<{ tagged: number; historical: number; argus: number }> {
    const r = await fetch(`${this.adminUrl}/admin/backfill-provenance`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ historical }),
    });
    if (!r.ok) throw new Error(`kb backfill failed: ${r.status} ${await r.text()}`);
    return (await r.json()) as { tagged: number; historical: number; argus: number };
  }
}
