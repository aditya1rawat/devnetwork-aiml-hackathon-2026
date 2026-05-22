import { describe, it, expect, vi } from "vitest";
import { McpPool } from "../src/mcp-pool.js";

describe("McpPool (basic)", () => {
  it("dispatches calls to the configured server by tool name", async () => {
    const callMock = vi.fn(async (server: string, tool: string, args: unknown) => ({ ok: true, server, tool, args }));
    const pool = new McpPool({
      tools: {
        search_logs: "logs",
        query_metrics: "metrics",
        query_traces: "traces",
        read_runbook: "runbook",
      },
      call: callMock,
    });
    const r = await pool.invoke({ step: 0, tool: "search_logs", args: { q: "OOM" } });
    expect(r.status).toBe("ok");
    expect(r.tool).toBe("search_logs");
    expect(callMock).toHaveBeenCalledWith("logs", "search_logs", { q: "OOM" });
  });

  it("returns error envelope when call throws", async () => {
    const pool = new McpPool({
      tools: { search_logs: "logs" } as Record<string, string>,
      call: async () => {
        throw new Error("nope");
      },
    });
    const r = await pool.invoke({ step: 0, tool: "search_logs", args: {} });
    expect(r.status).toBe("error");
  });
});
