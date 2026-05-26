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
