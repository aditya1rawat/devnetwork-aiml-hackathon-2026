const ORCH = process.env.NEXT_PUBLIC_ORCH_URL ?? "http://127.0.0.1:7200";
const ARGUS_APP = process.env.NEXT_PUBLIC_ARGUS_APP_URL ?? "http://localhost:3000";

export interface Triage {
  diagnosis: string;
  suspectedRootCause: string;
}

export async function triage(scenario: string): Promise<Triage> {
  const r = await fetch(`${ORCH}/triage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ scenario }),
  });
  if (!r.ok) throw new Error(`triage ${r.status}`);
  return (await r.json()) as Triage;
}

export async function startScenario(scenario: string): Promise<{ id: string }> {
  const r = await fetch(`${ORCH}/scenarios/${scenario}/start`, { method: "POST" });
  if (!r.ok) throw new Error(`scenario start ${r.status}`);
  return (await r.json()) as { id: string };
}

export function argusIncidentUrl(id: string): string {
  return `${ARGUS_APP}/incident/${id}`;
}
