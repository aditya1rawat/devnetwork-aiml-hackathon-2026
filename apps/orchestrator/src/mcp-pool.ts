import type { ToolCallRecord } from "./types.js";

export interface McpServerCall {
  step: number;
  tool: string;
  args: Record<string, unknown>;
}

export interface CircuitConfig {
  failureThreshold: number;
  openMs: number;
  cacheTtlMs: number;
}

export interface McpPoolOpts {
  tools: Record<string, string>;
  call: (server: string, tool: string, args: Record<string, unknown>) => Promise<unknown>;
  circuit?: CircuitConfig;
}

interface ToolBreakerState {
  failures: number;
  openUntil: number;
  lastSuccess: { at: number; result: unknown } | null;
  hint: string;
}

const HINTS: Record<string, string> = {
  search_logs: "try query_metrics for current state, or read_runbook",
  query_metrics: "try search_logs to find recent error patterns",
  query_traces: "fall back to search_logs and query_metrics",
  read_runbook: "skip and continue with logs/metrics evidence",
};

export class McpPool {
  private breakers = new Map<string, ToolBreakerState>();
  private cfg: CircuitConfig;

  constructor(private opts: McpPoolOpts) {
    this.cfg = opts.circuit ?? { failureThreshold: 3, openMs: 30_000, cacheTtlMs: 5 * 60_000 };
  }

  private breaker(tool: string): ToolBreakerState {
    let b = this.breakers.get(tool);
    if (!b) {
      b = { failures: 0, openUntil: 0, lastSuccess: null, hint: HINTS[tool] ?? "" };
      this.breakers.set(tool, b);
    }
    return b;
  }

  async invoke(req: McpServerCall): Promise<ToolCallRecord> {
    const server = this.opts.tools[req.tool];
    if (!server) {
      return { step: req.step, tool: req.tool, args: req.args, result: { error: `unknown tool ${req.tool}` }, durationMs: 0, status: "error" };
    }
    const b = this.breaker(req.tool);
    const now = Date.now();

    if (now < b.openUntil) {
      return this.synthetic(req, b, "circuit_open");
    }

    const t0 = Date.now();
    try {
      const result = await this.opts.call(server, req.tool, req.args);
      b.failures = 0;
      b.lastSuccess = { at: Date.now(), result };
      return { step: req.step, tool: req.tool, args: req.args, result, durationMs: Date.now() - t0, status: "ok" };
    } catch (err) {
      b.failures += 1;
      if (b.failures >= this.cfg.failureThreshold) {
        b.openUntil = Date.now() + this.cfg.openMs;
        b.failures = 0;
      }
      return { step: req.step, tool: req.tool, args: req.args, result: { error: (err as Error).message }, durationMs: Date.now() - t0, status: "error" };
    }
  }

  private synthetic(req: McpServerCall, b: ToolBreakerState, reason: string): ToolCallRecord {
    const now = Date.now();
    const cacheValid = b.lastSuccess && now - b.lastSuccess.at < this.cfg.cacheTtlMs;
    return {
      step: req.step,
      tool: req.tool,
      args: req.args,
      result: {
        status: "unavailable",
        reason,
        hint: b.hint,
        last_known: cacheValid ? b.lastSuccess!.result : null,
      },
      durationMs: 0,
      status: "synthetic",
    };
  }
}
