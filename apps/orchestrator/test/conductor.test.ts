import { describe, it, expect, vi } from "vitest";
import { runConductor } from "../src/conductor.js";
import { McpPool } from "../src/mcp-pool.js";
import { ProviderRegistry } from "../src/providers.js";
import type { GatewayClient } from "../src/gateway.js";

describe("Conductor", () => {
  it("walks the loop and terminates on report (single provider, no shadow)", async () => {
    const scripted = [
      { action: "search_logs", args: { service: "worker", q: "OOM" }, rationale: "look", hypotheses: ["leak"] },
      { action: "query_metrics", args: { service: "worker" }, rationale: "trend", hypotheses: ["leak"] },
      { action: "report", args: { markdown: "# Root cause\nworker OOM" }, rationale: "done", hypotheses: ["leak"] },
    ];
    let idx = 0;
    const gw = {
      chat: vi.fn(async () => ({
        text: JSON.stringify(scripted[idx++]),
        latencyMs: 10,
        provider: "claude" as const,
        via: "gateway" as const,
      })),
      setMode: vi.fn(),
      getMode: () => "gateway" as const,
      setProviderBlocked: vi.fn(),
    } as unknown as GatewayClient;

    const pool = new McpPool({
      tools: { search_logs: "logs", query_metrics: "metrics", query_traces: "traces", read_runbook: "runbook" },
      call: async () => ({ ok: true, fake: true }),
    });

    const events: unknown[] = [];
    const result = await runConductor({
      gateway: gw,
      pool,
      incidentId: "inc_x",
      primaryModel: "claude-x",
      shadowModel: "nemotron-x",
      maxSteps: 5,
      enableShadow: false,
      emit: (e) => events.push(e),
    });

    expect(result.finalReport).toContain("Root cause");
    expect(result.steps.length).toBe(3);
    expect(result.toolLog.length).toBe(2);
    expect(events.some((e: any) => e.type === "incident_done")).toBe(true);
  });

  it("fans to primary + shadow each step", async () => {
    let primaryCalls = 0;
    let shadowCalls = 0;
    const scripted = [
      { action: "search_logs", args: { service: "worker" }, rationale: "look", hypotheses: [] },
      { action: "report", args: { markdown: "# done" }, rationale: "done", hypotheses: [] },
    ];
    let idx = 0;
    const gw = {
      chat: vi.fn(async (req: { provider: "claude" | "nemotron" }) => {
        if (req.provider === "claude") primaryCalls++;
        else shadowCalls++;
        const step = scripted[Math.floor(idx / 2)]!;
        idx++;
        return { text: JSON.stringify(step), latencyMs: 5, provider: req.provider, via: "gateway" as const };
      }),
      setMode: vi.fn(),
      getMode: () => "gateway" as const,
      setProviderBlocked: vi.fn(),
    } as unknown as GatewayClient;
    const pool = new McpPool({ tools: { search_logs: "logs" } as Record<string, string>, call: async () => ({ ok: true }) });
    const reg = new ProviderRegistry(["claude", "nemotron"], { quarantineMs: 60_000 });

    await runConductor({
      gateway: gw,
      pool,
      incidentId: "inc_a",
      primaryModel: "c",
      shadowModel: "n",
      maxSteps: 5,
      enableShadow: true,
      providers: reg,
      emit: () => {},
    });

    expect(primaryCalls).toBe(2);
    expect(shadowCalls).toBe(2);
  });

  it("promotes shadow on primary failure with state intact", async () => {
    const scripted = [
      { action: "search_logs", args: {}, rationale: "look", hypotheses: [] },
      { action: "report", args: { markdown: "# done" }, rationale: "fin", hypotheses: [] },
    ];
    let stepCursor = 0;
    let claudeCalls = 0;
    const gw = {
      chat: vi.fn(async (req: { provider: "claude" | "nemotron" }) => {
        if (req.provider === "claude") {
          claudeCalls++;
          if (claudeCalls === 1) throw new Error("provider killed by chaos");
        }
        const step = scripted[Math.min(stepCursor, scripted.length - 1)]!;
        if (req.provider !== "claude" || claudeCalls > 1) stepCursor++;
        return { text: JSON.stringify(step), latencyMs: 5, provider: req.provider, via: "gateway" as const };
      }),
      setMode: vi.fn(),
      getMode: () => "gateway" as const,
      setProviderBlocked: vi.fn(),
    } as unknown as GatewayClient;
    const pool = new McpPool({ tools: { search_logs: "logs" } as Record<string, string>, call: async () => ({ ok: true }) });
    const reg = new ProviderRegistry(["claude", "nemotron"], { quarantineMs: 1 });
    const events: any[] = [];

    const result = await runConductor({
      gateway: gw,
      pool,
      incidentId: "inc_b",
      primaryModel: "c",
      shadowModel: "n",
      maxSteps: 8,
      enableShadow: true,
      providers: reg,
      emit: (e) => events.push(e),
    });

    expect(events.some((e) => e.type === "failover")).toBe(true);
    expect(result.primary).toBe("nemotron");
    expect(result.finalReport).toContain("done");
  });
});
