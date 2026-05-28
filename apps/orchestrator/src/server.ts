import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { GatewayClient } from "./gateway.js";
import { McpPool } from "./mcp-pool.js";
import { runConductor, type ConductorEvent } from "./conductor.js";
import { ProviderRegistry } from "./providers.js";
import { IncidentKbClient } from "./incident-kb-client.js";
import { saveIncident, loadAllIncidents, type PersistedIncident } from "./incident-store.js";

interface AppDeps {
  gateway: GatewayClient;
  pool: McpPool;
  registry: ProviderRegistry;
  chaosState: {
    killClaude: boolean;
    killNemotron: boolean;
    gatewayDown: boolean;
  };
  kb: IncidentKbClient | null;
  /** Previously-persisted incidents to rehydrate on boot. Loaded by the
   * entrypoint via {@link loadAllIncidents} before app construction. */
  preloaded?: PersistedIncident[];
}

interface DemoScenario {
  id: string;
  title: string;
  blurb: string;
  rootCause: string;
  chaosType: string;
  target: string;
  params: Record<string, number>;
  durationS: number;
  warmupS: number;
  // Display metadata for the ops board + distress surfaces.
  service: string;
  severity: "sev1" | "sev2" | "sev3";
  surfaceKey: string;
  productLabel: string;
  symptom: string;
  metric: { label: string; value: string; trend: "up" | "down" };
  sampleLog: string;
}

const DEMO_SCENARIOS: Record<string, DemoScenario> = {
  "worker-oom": {
    id: "worker-oom",
    title: "Worker OOM",
    blurb: "Worker process leaking 120MB/tick — heap exhaustion backing up the job queue.",
    rootCause: "memleak on worker",
    chaosType: "memleak",
    target: "worker",
    params: { mb_per_tick: 120 },
    durationS: 120,
    warmupS: 10,
    service: "worker",
    severity: "sev2",
    surfaceKey: "batch-console",
    productLabel: "Batch Jobs",
    symptom: "Worker heap climbing, job queue backing up",
    metric: { label: "heap_used", value: "92%", trend: "up" },
    sampleLog: "worker-3 heap_used=3.8GB queue_depth=11820",
  },
  "db-saturation": {
    id: "db-saturation",
    title: "DB Proxy Saturation",
    blurb: "db_proxy responding at 1.5s/query — every downstream API call hangs.",
    rootCause: "slow_query on db_proxy",
    chaosType: "slow_query",
    target: "db_proxy",
    params: { ms: 1500 },
    durationS: 120,
    warmupS: 3,
    service: "db_proxy",
    severity: "sev1",
    surfaceKey: "query-studio",
    productLabel: "Query Studio",
    symptom: "Query p99 at 1.5s, connection pool saturating",
    metric: { label: "pool_wait_p99", value: "1.5s", trend: "up" },
    sampleLog: "db pool exhausted inflight=16",
  },
  "auth-5xx": {
    id: "auth-5xx",
    title: "Auth 5xx Storm",
    blurb: "auth service throwing 503s on ~50% of verify calls — users bounced at sign-in.",
    rootCause: "error_5xx on auth",
    chaosType: "error_5xx",
    target: "auth",
    params: { rate: 0.5 },
    durationS: 120,
    warmupS: 3,
    service: "auth",
    severity: "sev1",
    surfaceKey: "sign-in",
    productLabel: "Sign In",
    symptom: "Logins failing, 503 rate climbing on auth",
    metric: { label: "auth_503_rate", value: "48%", trend: "up" },
    sampleLog: "chaos: 5xx injected path=/verify",
  },
  "api-brownout": {
    id: "api-brownout",
    title: "API Brownout",
    blurb: "api latency spiking under load — requests piling inflight, pages timing out.",
    rootCause: "cpu_saturation on api",
    chaosType: "latency",
    target: "api",
    params: { mean_ms: 1200 },
    durationS: 120,
    warmupS: 3,
    service: "api",
    severity: "sev2",
    surfaceKey: "app-dashboard",
    productLabel: "Dashboard",
    symptom: "App slow, requests piling inflight",
    metric: { label: "req_p99", value: "1.2s", trend: "up" },
    sampleLog: "api inflight=42 latency_p99=1180ms",
  },
  "db-timeout": {
    id: "db-timeout",
    title: "Upstream Timeouts",
    blurb: "db_proxy stalling 2.5s/call — api requests timing out, partition-like symptoms.",
    rootCause: "network_partition between api and db_proxy",
    chaosType: "latency",
    target: "db_proxy",
    params: { mean_ms: 2500 },
    durationS: 120,
    warmupS: 3,
    service: "db_proxy",
    severity: "sev2",
    surfaceKey: "connections",
    productLabel: "Connections",
    symptom: "Upstream db calls timing out from api",
    metric: { label: "db_timeout_rate", value: "31%", trend: "up" },
    sampleLog: "worker failed err=ReadTimeout job=...",
  },
  "api-config-drift": {
    id: "api-config-drift",
    title: "Bad Config Deploy",
    blurb: "a config revision flipped api routing to invalid — error spike right after deploy.",
    rootCause: "config_drift on api",
    chaosType: "config_drift",
    target: "api",
    params: { rate: 0.45, revision: 47 },
    durationS: 120,
    warmupS: 3,
    service: "api",
    severity: "sev1",
    surfaceKey: "deploys",
    productLabel: "Deploys",
    symptom: "Error spike immediately after config revision 47",
    metric: { label: "error_rate", value: "44%", trend: "up" },
    sampleLog: "config revision 47 applied: routing=invalid pool_size=0",
  },
};

type IncidentEntry = {
  events: ConductorEvent[];
  subs: Array<(e: ConductorEvent, idx: number) => void>;
  done: boolean;
  startedAt: number;
  endedAt?: number;
  scenario?: string;
};

export function buildApp(deps: AppDeps) {
  const app = new Hono();
  const incidents = new Map<string, IncidentEntry>();

  // CORS. Browsers block cross-origin requests from the Vercel-hosted
  // frontends (web :3000, ridgeline :3001 in dev; *.vercel.app in prod)
  // without these headers. Origin list is env-driven so prod can lock down
  // to specific Vercel URLs while local dev stays open.
  // `*` is fine for the demo footprint — no auth, all endpoints are read or
  // demo-write only — but CORS_ORIGINS lets you tighten it in prod.
  const corsOriginsRaw = process.env.CORS_ORIGINS ?? "*";
  const corsOrigins =
    corsOriginsRaw === "*"
      ? "*"
      : corsOriginsRaw.split(",").map((s) => s.trim()).filter(Boolean);
  app.use(
    "*",
    cors({
      origin: corsOrigins,
      allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowHeaders: ["content-type", "authorization"],
      // SSE clients (EventSource) don't send credentials by default — leaving
      // this off avoids the credentials/wildcard conflict that browsers reject.
      credentials: false,
      maxAge: 86400,
    }),
  );

  // Rehydrate any previously-persisted runs so a restart doesn't drop the
  // live view for incidents the user investigated earlier. New SSE connections
  // resubscribe via the standard sub list (empty on load).
  for (const p of deps.preloaded ?? []) {
    incidents.set(p.id, {
      events: p.events,
      subs: [],
      done: p.done,
      startedAt: p.startedAt,
      endedAt: p.endedAt,
      scenario: p.scenario,
    });
  }

  app.get("/health", (c) => c.json({ ok: true }));

  app.get("/state", (c) =>
    c.json({
      providers: {
        claude: { killed: deps.chaosState.killClaude },
        nemotron: { killed: deps.chaosState.killNemotron },
      },
      gateway: { mode: deps.chaosState.gatewayDown ? "direct" : "gateway" },
    }),
  );

  const SEVERITY_BY_SCENARIO: Record<string, "sev1" | "sev2" | "sev3"> = {
    "worker-oom": "sev2",
    "db-saturation": "sev1",
    "auth-5xx": "sev1",
    "api-brownout": "sev2",
    "db-timeout": "sev2",
    "api-config-drift": "sev1",
  };

  const KNOWN_SERVICES = new Set(["worker", "db_proxy", "auth", "gateway", "api"]);

  function statusFromEvents(events: ConductorEvent[]): "resolved" | "halted" | "failed_over" | "running" {
    const failoverEvt = events.find((e) => e.type === "failover");
    const doneEvt = [...events].reverse().find((e) => e.type === "incident_done");
    if (!doneEvt) return failoverEvt ? "failed_over" : "running";
    const preview = ((doneEvt.data as { report_md?: string }).report_md ?? "").toLowerCase();
    if (preview.includes("halted") || preview.includes("incomplete")) return "halted";
    return "resolved";
  }

  function buildBundle(id: string, scenarioId: string | undefined, events: ConductorEvent[]) {
    const doneEvt = [...events].reverse().find((e) => e.type === "incident_done");
    const reportMd = String((doneEvt?.data as { report_md?: string })?.report_md ?? "");
    const failedOver = events.some((e) => e.type === "failover");
    const severity: "sev1" | "sev2" | "sev3" = scenarioId ? (SEVERITY_BY_SCENARIO[scenarioId] ?? "sev2") : "sev2";

    const servicesTouched = Array.from(
      new Set(
        events
          .filter((e) => e.type === "tool_call")
          .map((e) => String((e.data as { args?: { service?: string } }).args?.service ?? ""))
          .filter((s) => KNOWN_SERVICES.has(s)),
      ),
    );

    const toolLines = events
      .filter((e) => e.type === "tool_call")
      .slice(0, 12)
      .map((e) => {
        const d = e.data as { tool?: string; args?: Record<string, unknown> };
        return `${d.tool}(${JSON.stringify(d.args ?? {})})`;
      });
    const toolLogDigest = toolLines.join("; ").slice(0, 1200);

    const title = scenarioId ? `${scenarioId} ${id}` : `Incident ${id}`;
    const cfg = scenarioId ? DEMO_SCENARIOS[scenarioId] : undefined;

    return {
      incident_id: id,
      title,
      report_md: reportMd || "# Incident\n(no report content)",
      scenario: scenarioId ?? null,
      failed_over: failedOver,
      severity,
      resolved_at: new Date().toISOString(),
      services_touched: servicesTouched,
      tool_log_digest: toolLogDigest,
      // Structured linking facts so the KB extracts a handful of clean entities
      // instead of mining the full prose report (keeps Graphiti under the
      // provider RPM limit). Full report is still stored for retrieval.
      root_cause: cfg?.rootCause ?? "",
      symptom: cfg?.symptom ?? "",
      summary: cfg?.blurb ?? "",
      provenance: "argus" as const,
    };
  }

  function spawnIncident(id: string, scenario?: string) {
    const entry = {
      events: [] as ConductorEvent[],
      subs: [] as Array<(e: ConductorEvent, idx: number) => void>,
      done: false,
      startedAt: Date.now(),
      endedAt: undefined as number | undefined,
      scenario,
    };
    incidents.set(id, entry);

    runConductor({
      gateway: deps.gateway,
      pool: deps.pool,
      incidentId: id,
      primaryModel: process.env.CLAUDE_MODEL ?? "anthropic/claude-sonnet-4-6",
      shadowModel: process.env.NEMOTRON_MODEL ?? "nvidia/nemotron",
      maxSteps: 14,
      enableShadow: true,
      providers: deps.registry,
      emit: (e) => {
        entry.events.push(e);
        const idx = entry.events.length - 1;
        for (const fn of entry.subs) fn(e, idx);
        if (e.type === "incident_done") {
          entry.done = true;
          entry.endedAt = Date.now();
          // Clear any chaos state set during this investigation. Without this,
          // a "kill claude" from a previous demo run leaves the killed flag set
          // and trips the next incident's primary precheck. Each run starts
          // clean. Pre-staging chaos before /scenarios/:id/start still works.
          if (deps.chaosState.killClaude) {
            deps.chaosState.killClaude = false;
            deps.gateway.setProviderBlocked("claude", false);
            broadcastProviderState("claude", false, "auto-restore");
          }
          if (deps.chaosState.killNemotron) {
            deps.chaosState.killNemotron = false;
            deps.gateway.setProviderBlocked("nemotron", false);
            broadcastProviderState("nemotron", false, "auto-restore");
          }
          if (deps.chaosState.gatewayDown) {
            deps.chaosState.gatewayDown = false;
            deps.gateway.setMode("gateway");
            broadcastGatewayMode("gateway");
          }
          // Persist before triggering KB ingest so a crash mid-ingest still
          // leaves the live view recoverable.
          saveIncident({
            id,
            events: entry.events,
            done: true,
            startedAt: entry.startedAt,
            endedAt: entry.endedAt,
            scenario: entry.scenario,
          }).catch((err: unknown) => {
            console.warn(`[argus] failed to persist incident ${id}: ${(err as Error).message}`);
          });
          const status = statusFromEvents(entry.events);
          if (status === "resolved" && deps.kb) {
            // Skip re-ingest if this id is already in the KB (e.g., someone
            // ran an investigation against a seeded incident id). The archive
            // view will surface the original record instead.
            const kb = deps.kb;
            kb.getReport(id).then(
              (existing) => {
                if (existing !== null) {
                  console.log(`[argus] skip kb ingest for ${id}: already in knowledge base`);
                  return;
                }
                const bundle = buildBundle(id, entry.scenario, entry.events);
                kb.ingest(bundle).then(
                  (res) => {
                    const evt: ConductorEvent = { type: "kb_ingest_queued", data: { job_id: res.job_id } };
                    entry.events.push(evt);
                    const idx2 = entry.events.length - 1;
                    for (const fn of entry.subs) fn(evt, idx2);
                  },
                  (err: unknown) => {
                    console.warn(`[argus] kb ingest failed for ${id}: ${(err as Error).message}`);
                  },
                );
              },
              (err: unknown) => {
                console.warn(`[argus] kb dedup check failed for ${id}, skipping ingest: ${(err as Error).message}`);
              },
            );
          }
        }
      },
    }).catch((err: unknown) => {
      const errMsg = err instanceof Error ? err.message : String(err);
      const e: ConductorEvent = { type: "incident_done", data: { error: errMsg } };
      entry.events.push(e);
      const idx = entry.events.length - 1;
      for (const fn of entry.subs) fn(e, idx);
      entry.done = true;
      entry.endedAt = Date.now();
    });
  }

  app.post("/incident/:id/start", async (c) => {
    const id = c.req.param("id");
    if (incidents.has(id)) return c.json({ ok: false, error: "already started" }, 400);
    spawnIncident(id);
    return c.json({ ok: true });
  });

  app.get("/scenarios", (c) => c.json({ scenarios: Object.values(DEMO_SCENARIOS) }));

  app.post("/scenarios/:scenario/start", async (c) => {
    const scenario = c.req.param("scenario");
    const cfg = DEMO_SCENARIOS[scenario];
    if (!cfg) return c.json({ ok: false, error: "unknown scenario" }, 404);
    const id = `${cfg.id}-${Date.now().toString(36)}`;
    if (incidents.has(id)) return c.json({ ok: false, error: "id collision" }, 500);

    const clusterUrl = process.env.MOCK_CLUSTER_URL ?? "http://127.0.0.1:7100";
    try {
      await fetch(`${clusterUrl}/chaos/inject`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: cfg.chaosType, target: cfg.target, duration_s: cfg.durationS, params: cfg.params }),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ ok: false, error: `chaos inject failed: ${msg}` }, 502);
    }

    if (cfg.warmupS > 0) await new Promise((r) => setTimeout(r, cfg.warmupS * 1000));
    spawnIncident(id, cfg.id);
    return c.json({ ok: true, id });
  });

  const TRIAGE_MODEL = process.env.TRIAGE_MODEL ?? process.env.CLAUDE_MODEL ?? "anthropic/claude-sonnet-4-6";

  function fallbackTriage(cfg: DemoScenario): { diagnosis: string; suspectedRootCause: string } {
    return {
      diagnosis: `${cfg.symptom}. Observed: ${cfg.sampleLog}`,
      suspectedRootCause: cfg.rootCause,
    };
  }

  app.post("/triage", async (c) => {
    const body = await c.req.json<{ scenario?: string }>().catch(() => ({}) as { scenario?: string });
    const scenario = body.scenario ?? "";
    const cfg = DEMO_SCENARIOS[scenario];
    if (!cfg) return c.json({ error: "unknown scenario" }, 404);

    const prompt = [
      "You are Argus, an autonomous SRE triage agent. A production incident just fired.",
      `Service: ${cfg.service}`,
      `Symptom: ${cfg.symptom}`,
      `Key metric: ${cfg.metric.label}=${cfg.metric.value} (trend ${cfg.metric.trend})`,
      `Sample log: ${cfg.sampleLog}`,
      "",
      'Give a first-pass triage. Respond ONLY with JSON of the form {"diagnosis": "<1-2 sentences, observational and precise>", "suspectedRootCause": "<short phrase>"}.',
    ].join("\n");

    try {
      const res = await deps.gateway.chat({
        provider: "claude",
        model: TRIAGE_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
        maxTokens: 300,
        responseFormat: "json_object",
      });
      // Some models wrap JSON in ```json fences or prose despite response_format,
      // so pull out the first {...} block before parsing.
      const fenced = res.text.match(/```(?:json)?\s*([\s\S]*?)```/i);
      const candidate = fenced?.[1] ?? res.text;
      const start = candidate.indexOf("{");
      const end = candidate.lastIndexOf("}");
      const jsonText = start >= 0 && end > start ? candidate.slice(start, end + 1) : candidate;
      const parsed = JSON.parse(jsonText) as { diagnosis?: string; suspectedRootCause?: string };
      if (!parsed.diagnosis || !parsed.suspectedRootCause) throw new Error("incomplete triage");
      return c.json({ diagnosis: parsed.diagnosis, suspectedRootCause: parsed.suspectedRootCause });
    } catch {
      return c.json(fallbackTriage(cfg));
    }
  });

  app.get("/incidents", (c) => {
    const list = Array.from(incidents.entries()).map(([id, entry]) => {
      const failoverEvt = entry.events.find((e) => e.type === "failover");
      const doneEvt = [...entry.events].reverse().find((e) => e.type === "incident_done");
      const reportPreview = ((doneEvt?.data as { report_md?: string })?.report_md ?? "").slice(0, 220);
      const stepCount = entry.events.filter((e) => e.type === "step_start").length;
      const status: "running" | "failed_over" | "halted" | "resolved" = !entry.done
        ? failoverEvt
          ? "failed_over"
          : "running"
        : reportPreview.toLowerCase().includes("halted") || reportPreview.toLowerCase().includes("incomplete")
          ? "halted"
          : "resolved";
      const scenarioCfg = entry.scenario ? DEMO_SCENARIOS[entry.scenario] : undefined;
      return {
        id,
        status,
        stepCount,
        startedAt: entry.startedAt,
        endedAt: entry.endedAt ?? null,
        reportPreview,
        scenario: entry.scenario ?? null,
        scenarioTitle: scenarioCfg?.title ?? null,
        failedOver: !!failoverEvt,
      };
    });
    list.sort((a, b) => b.startedAt - a.startedAt);
    return c.json({ incidents: list });
  });

  app.get("/incident/:id/stream", (c) =>
    streamSSE(c, async (stream) => {
      const id = c.req.param("id");
      const entry = incidents.get(id);
      if (!entry) {
        await stream.writeSSE({ event: "error", data: JSON.stringify({ error: "not_found" }) });
        return;
      }
      // EventSource auto-reconnects on transient drops; resume from the last
      // event the client received so we don't replay duplicates.
      const lastIdStr = c.req.header("Last-Event-ID");
      const lastId = lastIdStr !== undefined && /^\d+$/.test(lastIdStr) ? Number(lastIdStr) : -1;
      for (let i = lastId + 1; i < entry.events.length; i++) {
        const e = entry.events[i]!;
        await stream.writeSSE({ event: e.type, id: String(i), data: JSON.stringify(e.data) });
      }
      if (entry.done) return;
      await new Promise<void>((resolve) => {
        const fn = (e: ConductorEvent, idx: number) => {
          stream.writeSSE({ event: e.type, id: String(idx), data: JSON.stringify(e.data) }).catch(() => {});
          if (e.type === "incident_done") {
            const i = entry.subs.indexOf(fn);
            if (i >= 0) entry.subs.splice(i, 1);
            resolve();
          }
        };
        entry.subs.push(fn);
      });
    }),
  );

  function broadcast(e: ConductorEvent): void {
    for (const entry of incidents.values()) {
      entry.events.push(e);
      const idx = entry.events.length - 1;
      for (const fn of entry.subs) fn(e, idx);
    }
  }

  function broadcastProviderState(provider: "claude" | "nemotron", killed: boolean, reason: string): void {
    broadcast({ type: "provider_state", data: { provider, killed, reason } });
  }

  app.post("/chaos/kill-provider", async (c) => {
    const body = await c.req.json<{ provider: "claude" | "nemotron" }>();
    if (body.provider === "claude") deps.chaosState.killClaude = true;
    if (body.provider === "nemotron") deps.chaosState.killNemotron = true;
    deps.gateway.setProviderBlocked(body.provider, true);
    broadcastProviderState(body.provider, true, "chaos");
    return c.json({ ok: true });
  });

  app.post("/chaos/restore-provider", async (c) => {
    const body = await c.req.json<{ provider: "claude" | "nemotron" }>();
    if (body.provider === "claude") deps.chaosState.killClaude = false;
    if (body.provider === "nemotron") deps.chaosState.killNemotron = false;
    deps.gateway.setProviderBlocked(body.provider, false);
    broadcastProviderState(body.provider, false, "chaos");
    return c.json({ ok: true });
  });

  function broadcastGatewayMode(mode: "gateway" | "direct"): void {
    broadcast({ type: "gateway_mode", data: { mode } });
  }

  app.post("/chaos/sever-gateway", async (c) => {
    deps.chaosState.gatewayDown = true;
    deps.gateway.setMode("direct");
    broadcastGatewayMode("direct");
    return c.json({ ok: true });
  });

  app.post("/chaos/restore-gateway", async (c) => {
    deps.chaosState.gatewayDown = false;
    deps.gateway.setMode("gateway");
    broadcastGatewayMode("gateway");
    return c.json({ ok: true });
  });

  app.get("/incidents/historical", async (c) => {
    if (!deps.kb) return c.json({ incidents: [] });
    try {
      const items = await deps.kb.listIncidents("historical");
      return c.json({ incidents: items });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 502);
    }
  });

  app.get("/incident/:id/report", async (c) => {
    if (!deps.kb) return c.json({ error: "kb unavailable" }, 503);
    const id = c.req.param("id");
    try {
      const report = await deps.kb.getReport(id);
      if (report === null) return c.json({ error: "not in kb" }, 404);
      return c.json(report);
    } catch (err) {
      return c.json({ error: (err as Error).message }, 502);
    }
  });

  app.get("/incident/:id/case-graph", async (c) => {
    if (!deps.kb) return c.json({ error: "kb unavailable" }, 503);
    const id = c.req.param("id");
    try {
      const graph = await deps.kb.caseGraph(id);
      return c.json(graph);
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes("404")) return c.json({ error: "not in kb yet" }, 404);
      return c.json({ error: msg }, 502);
    }
  });

  app.get("/incident/:id/ingest-status", async (c) => {
    if (!deps.kb) return c.json({ error: "kb unavailable" }, 503);
    const id = c.req.param("id");
    try {
      const status = await deps.kb.ingestStatus(id);
      return c.json(status);
    } catch (err) {
      return c.json({ error: (err as Error).message }, 502);
    }
  });

  app.post("/admin/kb/reset", async (c) => {
    if (!deps.kb) return c.json({ error: "kb unavailable" }, 503);
    try {
      await deps.kb.reset();
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 502);
    }
  });

  app.post("/admin/kb/ingest", async (c) => {
    if (!deps.kb) return c.json({ error: "kb unavailable" }, 503);
    const id = c.req.query("id");
    if (!id) return c.json({ error: "id query required" }, 400);
    const entry = incidents.get(id);
    if (!entry) return c.json({ error: "unknown incident" }, 404);
    try {
      const bundle = buildBundle(id, entry.scenario, entry.events);
      const res = await deps.kb.ingest(bundle);
      return c.json({ ok: true, job_id: res.job_id });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 502);
    }
  });

  return { app, incidents };
}
