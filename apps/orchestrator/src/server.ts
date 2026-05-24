import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { GatewayClient } from "./gateway.js";
import { McpPool } from "./mcp-pool.js";
import { runConductor, type ConductorEvent } from "./conductor.js";
import { ProviderRegistry } from "./providers.js";

interface AppDeps {
  gateway: GatewayClient;
  pool: McpPool;
  registry: ProviderRegistry;
  chaosState: {
    killClaude: boolean;
    killNemotron: boolean;
    gatewayDown: boolean;
  };
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
}

const DEMO_SCENARIOS: Record<string, DemoScenario> = {
  "worker-oom": {
    id: "worker-oom",
    title: "Worker OOM",
    blurb: "Worker process leaking 120MB/tick — heap exhaustion causing the job queue to back up.",
    rootCause: "memleak on worker",
    chaosType: "memleak",
    target: "worker",
    params: { mb_per_tick: 120 },
    durationS: 120,
    warmupS: 10,
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
  },
};

export function buildApp(deps: AppDeps) {
  const app = new Hono();
  const incidents = new Map<
    string,
    {
      events: ConductorEvent[];
      subs: Array<(e: ConductorEvent) => void>;
      done: boolean;
      startedAt: number;
      endedAt?: number;
      scenario?: string;
    }
  >();

  app.get("/health", (c) => c.json({ ok: true }));

  // CORS for the web app
  app.use("*", async (c, next) => {
    c.res.headers.set("access-control-allow-origin", "*");
    c.res.headers.set("access-control-allow-methods", "GET,POST,OPTIONS");
    c.res.headers.set("access-control-allow-headers", "content-type");
    if (c.req.method === "OPTIONS") return c.body(null, 204);
    await next();
  });

  function spawnIncident(id: string, scenario?: string) {
    const entry = {
      events: [] as ConductorEvent[],
      subs: [] as Array<(e: ConductorEvent) => void>,
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
      primaryModel: process.env.CLAUDE_MODEL ?? "claude-sonnet-4-6",
      shadowModel: process.env.NEMOTRON_MODEL ?? "nvidia/nemotron",
      maxSteps: 12,
      enableShadow: true,
      providers: deps.registry,
      emit: (e) => {
        entry.events.push(e);
        for (const fn of entry.subs) fn(e);
        if (e.type === "incident_done") {
          entry.done = true;
          entry.endedAt = Date.now();
        }
      },
    }).catch((err: unknown) => {
      const errMsg = err instanceof Error ? err.message : String(err);
      const e: ConductorEvent = { type: "incident_done", data: { error: errMsg } };
      entry.events.push(e);
      for (const fn of entry.subs) fn(e);
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
      for (const e of entry.events) {
        await stream.writeSSE({ event: e.type, data: JSON.stringify(e.data) });
      }
      if (entry.done) return;
      await new Promise<void>((resolve) => {
        const fn = (e: ConductorEvent) => {
          stream.writeSSE({ event: e.type, data: JSON.stringify(e.data) }).catch(() => {});
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

  app.post("/chaos/kill-provider", async (c) => {
    const body = await c.req.json<{ provider: "claude" | "nemotron" }>();
    if (body.provider === "claude") deps.chaosState.killClaude = true;
    if (body.provider === "nemotron") deps.chaosState.killNemotron = true;
    deps.gateway.setProviderBlocked(body.provider, true);
    return c.json({ ok: true });
  });

  app.post("/chaos/restore-provider", async (c) => {
    const body = await c.req.json<{ provider: "claude" | "nemotron" }>();
    if (body.provider === "claude") deps.chaosState.killClaude = false;
    if (body.provider === "nemotron") deps.chaosState.killNemotron = false;
    deps.gateway.setProviderBlocked(body.provider, false);
    return c.json({ ok: true });
  });

  function broadcastGatewayMode(mode: "gateway" | "direct"): void {
    for (const entry of incidents.values()) {
      const e: ConductorEvent = { type: "gateway_mode", data: { mode } };
      entry.events.push(e);
      for (const fn of entry.subs) fn(e);
    }
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

  return { app, incidents };
}
