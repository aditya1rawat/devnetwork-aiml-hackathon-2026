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

export async function severGateway() {
  await fetch(`${ORCH}/chaos/sever-gateway`, { method: "POST" });
}

export async function restoreGateway() {
  await fetch(`${ORCH}/chaos/restore-gateway`, { method: "POST" });
}

export function streamUrl(id: string): string {
  return `${ORCH}/incident/${id}/stream`;
}
