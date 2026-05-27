const ORCH = process.env.NEXT_PUBLIC_ORCH_URL ?? "http://127.0.0.1:7200";

export async function startIncident(id: string) {
  const r = await fetch(`${ORCH}/incident/${id}/start`, { method: "POST" });
  if (!r.ok && r.status !== 400) throw new Error(`start ${r.status}`);
}

export async function killProvider(provider: "claude" | "nemotron") {
  await fetch(`${ORCH}/chaos/kill-provider`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ provider }),
  });
}

export async function restoreProvider(provider: "claude" | "nemotron") {
  await fetch(`${ORCH}/chaos/restore-provider`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ provider }),
  });
}

export function streamUrl(id: string): string {
  return `${ORCH}/incident/${id}/stream`;
}

export interface DemoScenario {
  id: string;
  title: string;
  blurb: string;
  rootCause: string;
  chaosType: string;
  target: string;
  params: Record<string, number>;
  durationS: number;
  warmupS: number;
  service: string;
  severity: "sev1" | "sev2" | "sev3";
  surfaceKey: string;
  productLabel: string;
  symptom: string;
  metric: { label: string; value: string; trend: "up" | "down" };
  sampleLog: string;
}

export interface IncidentSummary {
  id: string;
  status: "running" | "failed_over" | "halted" | "resolved";
  stepCount: number;
  startedAt: number;
  endedAt: number | null;
  reportPreview: string;
  scenario: string | null;
  scenarioTitle: string | null;
  failedOver: boolean;
}

export async function listScenarios(): Promise<DemoScenario[]> {
  const r = await fetch(`${ORCH}/scenarios`, { cache: "no-store" });
  if (!r.ok) throw new Error(`scenarios ${r.status}`);
  const j = (await r.json()) as { scenarios: DemoScenario[] };
  return j.scenarios;
}

export async function getScenario(id: string): Promise<DemoScenario | null> {
  const all = await listScenarios();
  return all.find((s) => s.id === id) ?? null;
}

export async function startScenario(scenario: string): Promise<{ id: string }> {
  const r = await fetch(`${ORCH}/scenarios/${scenario}/start`, { method: "POST" });
  if (!r.ok) throw new Error(`scenario start ${r.status}`);
  return (await r.json()) as { id: string };
}

export interface OrchestratorState {
  providers: { claude: { killed: boolean }; nemotron: { killed: boolean } };
  gateway: { mode: "gateway" | "direct" };
}

export async function getOrchestratorState(): Promise<OrchestratorState> {
  const r = await fetch(`${ORCH}/state`, { cache: "no-store" });
  if (!r.ok) throw new Error(`state ${r.status}`);
  return (await r.json()) as OrchestratorState;
}

export async function listIncidents(): Promise<IncidentSummary[]> {
  const r = await fetch(`${ORCH}/incidents`, { cache: "no-store" });
  if (!r.ok) throw new Error(`incidents ${r.status}`);
  const j = (await r.json()) as { incidents: IncidentSummary[] };
  return j.incidents;
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

export async function getCaseGraph(id: string): Promise<CaseGraph | null> {
  const r = await fetch(`${ORCH}/incident/${id}/case-graph`, { cache: "no-store" });
  if (r.status === 404 || r.status === 503) return null;
  if (!r.ok) throw new Error(`case-graph ${r.status}`);
  return (await r.json()) as CaseGraph;
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
  /** "argus" = investigated live by this system; "historical" = pre-Argus. */
  provenance?: "argus" | "historical" | string;
}

export async function getStoredIncidentReport(id: string): Promise<StoredIncidentReport | null> {
  const r = await fetch(`${ORCH}/incident/${id}/report`, { cache: "no-store" });
  if (r.status === 404 || r.status === 503) return null;
  if (!r.ok) throw new Error(`stored-report ${r.status}`);
  return (await r.json()) as StoredIncidentReport;
}

export async function isIncidentLive(id: string): Promise<boolean> {
  const list = await listIncidents();
  return list.some((i) => i.id === id);
}

export interface HistoricalIncident {
  incident_id: string;
  title?: string;
  severity?: string;
  scenario?: string | null;
  failed_over?: boolean;
  services_touched?: string[];
  resolved_at?: string;
  provenance: string;
}

export async function listHistoricalIncidents(): Promise<HistoricalIncident[]> {
  const r = await fetch(`${ORCH}/incidents/historical`, { cache: "no-store" });
  if (!r.ok) return [];
  const j = (await r.json()) as { incidents: HistoricalIncident[] };
  return j.incidents ?? [];
}

export async function resetKB(): Promise<void> {
  const r = await fetch(`${ORCH}/admin/kb/reset`, { method: "POST" });
  if (!r.ok) throw new Error(`reset kb ${r.status}`);
}

export async function manualIngest(id: string): Promise<void> {
  const r = await fetch(`${ORCH}/admin/kb/ingest?id=${encodeURIComponent(id)}`, { method: "POST" });
  if (!r.ok) throw new Error(`ingest ${r.status}`);
}
