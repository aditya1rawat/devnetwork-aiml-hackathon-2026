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

export function buildApp(deps: AppDeps) {
  const app = new Hono();
  const incidents = new Map<
    string,
    { events: ConductorEvent[]; subs: Array<(e: ConductorEvent) => void>; done: boolean }
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

  app.post("/incident/:id/start", async (c) => {
    const id = c.req.param("id");
    if (incidents.has(id)) return c.json({ ok: false, error: "already started" }, 400);
    const entry = { events: [] as ConductorEvent[], subs: [] as Array<(e: ConductorEvent) => void>, done: false };
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
        }
      },
    }).catch((err: unknown) => {
      const errMsg = err instanceof Error ? err.message : String(err);
      const e: ConductorEvent = { type: "incident_done", data: { error: errMsg } };
      entry.events.push(e);
      for (const fn of entry.subs) fn(e);
      entry.done = true;
    });

    return c.json({ ok: true });
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
