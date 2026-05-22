import { describe, it, expect, vi } from "vitest";
import { McpPool } from "../src/mcp-pool.js";

describe("McpPool circuit breaker", () => {
  it("opens circuit after 3 consecutive failures", async () => {
    let calls = 0;
    const pool = new McpPool({
      tools: { search_logs: "logs" } as Record<string, string>,
      call: async () => { calls++; throw new Error("boom"); },
      circuit: { failureThreshold: 3, openMs: 30_000, cacheTtlMs: 60_000 },
    });
    for (let i = 0; i < 3; i++) {
      const r = await pool.invoke({ step: i, tool: "search_logs", args: {} });
      expect(r.status).toBe("error");
    }
    const r = await pool.invoke({ step: 99, tool: "search_logs", args: {} });
    expect(r.status).toBe("synthetic");
    expect((r.result as { status?: string }).status).toBe("unavailable");
    expect(calls).toBe(3);
  });

  it("returns last_known cached value in synthetic envelope", async () => {
    let calls = 0;
    const pool = new McpPool({
      tools: { search_logs: "logs" } as Record<string, string>,
      call: async () => {
        calls++;
        if (calls === 1) return { count: 5, logs: ["ok"] };
        throw new Error("down");
      },
      circuit: { failureThreshold: 2, openMs: 30_000, cacheTtlMs: 60_000 },
    });
    const ok = await pool.invoke({ step: 0, tool: "search_logs", args: {} });
    expect(ok.status).toBe("ok");
    await pool.invoke({ step: 1, tool: "search_logs", args: {} });
    await pool.invoke({ step: 2, tool: "search_logs", args: {} });
    const synth = await pool.invoke({ step: 3, tool: "search_logs", args: {} });
    expect(synth.status).toBe("synthetic");
    const env = synth.result as { last_known: { count: number } };
    expect(env.last_known.count).toBe(5);
  });
});
