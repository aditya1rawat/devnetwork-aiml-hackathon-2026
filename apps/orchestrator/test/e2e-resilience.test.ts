import { describe, it, expect, vi } from "vitest";
import { runConductor } from "../src/conductor.js";
import { McpPool } from "../src/mcp-pool.js";
import { ProviderRegistry } from "../src/providers.js";
import type { GatewayClient } from "../src/gateway.js";

describe("E2E resilience", () => {
  it("survives provider death + MCP failure in same run", async () => {
    const scripted = [
      { action: "search_logs", args: { service: "worker", q: "OOM" }, rationale: "look for OOM", hypotheses: [] },
      { action: "query_metrics", args: { service: "worker" }, rationale: "trend check", hypotheses: [] },
      { action: "query_metrics", args: { service: "worker" }, rationale: "retry metrics", hypotheses: [] },
      { action: "report", args: { markdown: "# Root cause\nWorker OOM. Note: metrics tool unavailable mid-run." }, rationale: "fin", hypotheses: [] },
    ];
    let claudeCalls = 0;
    let stepCursor = 0;
    const gw = {
      chat: vi.fn(async (req: { provider: "claude" | "nemotron" }) => {
        if (req.provider === "claude") {
          claudeCalls++;
          if (claudeCalls === 2) throw new Error("primary down");
        }
        const step = scripted[Math.min(stepCursor, scripted.length - 1)]!;
        if (req.provider !== "claude" || claudeCalls > 1) stepCursor++;
        return { text: JSON.stringify(step), latencyMs: 5, provider: req.provider, via: "gateway" as const };
      }),
      setMode: vi.fn(),
      getMode: () => "gateway" as const,
      setProviderBlocked: vi.fn(),
    } as unknown as GatewayClient;
    let metricsCalls = 0;
    const pool = new McpPool({
      tools: { search_logs: "logs", query_metrics: "metrics" } as Record<string, string>,
      call: async (_s, tool) => {
        if (tool === "query_metrics") {
          metricsCalls++;
          throw new Error("metrics down");
        }
        return { ok: true };
      },
      circuit: { failureThreshold: 1, openMs: 30_000, cacheTtlMs: 60_000 },
    });
    const reg = new ProviderRegistry(["claude", "nemotron"], { quarantineMs: 1 });
    const events: any[] = [];
    const result = await runConductor({
      gateway: gw,
      pool,
      incidentId: "e2e",
      primaryModel: "c",
      shadowModel: "n",
      maxSteps: 8,
      enableShadow: true,
      providers: reg,
      emit: (e) => events.push(e),
    });
    expect(events.some((e) => e.type === "failover")).toBe(true);
    expect(
      events.some((e) => e.type === "tool_result" && (e.data as any).status === "synthetic"),
    ).toBe(true);
    expect(result.finalReport).toContain("Root cause");
    expect(metricsCalls).toBeGreaterThan(0);
  });
});
