const BASE = process.env.MOCK_CLUSTER_URL ?? "http://127.0.0.1:7100";

export async function getLogs(opts: { service?: string; q?: string; since?: number }) {
  const params = new URLSearchParams();
  if (opts.service) params.set("service", opts.service);
  if (opts.q) params.set("q", opts.q);
  if (opts.since !== undefined) params.set("since", String(opts.since));
  const res = await fetch(`${BASE}/logs?${params.toString()}`);
  if (!res.ok) throw new Error(`logs ${res.status}`);
  return (await res.json()) as Array<Record<string, unknown>>;
}

export async function getMetrics(service?: string) {
  const params = new URLSearchParams();
  if (service) params.set("service", service);
  const res = await fetch(`${BASE}/metrics?${params.toString()}`);
  if (!res.ok) throw new Error(`metrics ${res.status}`);
  return (await res.json()) as Record<string, string>;
}

export async function getTraces(service?: string) {
  const params = new URLSearchParams();
  if (service) params.set("service", service);
  const res = await fetch(`${BASE}/traces?${params.toString()}`);
  if (!res.ok) throw new Error(`traces ${res.status}`);
  return (await res.json()) as Array<Record<string, unknown>>;
}
