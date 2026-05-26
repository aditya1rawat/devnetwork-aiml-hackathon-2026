import { createIncident, appendStep, appendToolResult, finalize, renderHistory } from "./state.js";
import { SYSTEM_PROMPT } from "./prompts.js";
import { type GatewayClient } from "./gateway.js";
import type { McpPool } from "./mcp-pool.js";
import { compareSteps } from "./divergence.js";
import { promoteShadow, pickNewShadow } from "./failover.js";
import type { AgentAction, AgentStep, IncidentState, ProviderName } from "./types.js";
import type { ProviderRegistry } from "./providers.js";

export interface ConductorEvent {
  type:
    | "step_start"
    | "primary_step"
    | "shadow_step"
    | "tool_call"
    | "tool_result"
    | "divergence"
    | "failover"
    | "gateway_mode"
    | "provider_state"
    | "kb_lookup_started"
    | "kb_lookup_result"
    | "kb_ingest_queued"
    | "incident_done";
  data: Record<string, unknown>;
}

export interface ConductorOpts {
  gateway: GatewayClient;
  pool: McpPool;
  incidentId: string;
  primaryModel: string;
  shadowModel: string;
  maxSteps: number;
  enableShadow: boolean;
  providers?: ProviderRegistry;
  emit?: (e: ConductorEvent) => void;
  stepTimeoutMs?: number;
}

export async function runConductor(opts: ConductorOpts): Promise<IncidentState> {
  const s = createIncident(opts.incidentId, SYSTEM_PROMPT);
  const emit = opts.emit ?? (() => {});
  const timeoutMs = opts.stepTimeoutMs ?? 30_000;
  let failoverBudget = 3;

  for (let step = 0; step < opts.maxSteps; step++) {
    emit({ type: "step_start", data: { step, primary: s.primary, shadow: s.shadow } });
    const isFinalStep = step === opts.maxSteps - 1;
    const messages = buildMessages(s, isFinalStep);

    let primaryRes;
    try {
      primaryRes = await withTimeout(
        opts.gateway.chat({
          provider: s.primary,
          model: modelFor(s.primary, opts),
          messages,
          temperature: 0,
          maxTokens: 4096,
          responseFormat: "json_object",
        }),
        timeoutMs,
      );
    } catch (err) {
      emit({ type: "failover", data: { reason: "primary_error", error: (err as Error).message, from: s.primary, to: s.shadow } });
      emit({ type: "provider_state", data: { provider: s.primary, killed: true, reason: "failover" } });
      if (opts.providers) opts.providers.markFailure(s.primary, Date.now());
      failoverBudget -= 1;
      if (s.shadow === null || failoverBudget <= 0) {
        finalize(s, "# Investigation halted\nBoth providers unavailable.");
        emit({ type: "incident_done", data: { report_md: s.finalReport } });
        return s;
      }
      promoteShadow(s);
      if (opts.providers) {
        const newShadow = pickNewShadow(s, opts.providers);
        s.shadow = newShadow;
      }
      continue;
    }
    emit({ type: "primary_step", data: { step, text: primaryRes.text, provider: s.primary, latencyMs: primaryRes.latencyMs } });

    let parsedPrimary: AgentStep;
    try {
      parsedPrimary = parseStep(step, primaryRes.text);
    } catch (err) {
      s.messages.push({ role: "assistant", content: primaryRes.text });
      s.messages.push({ role: "user", content: `Your last message was not valid JSON. ${(err as Error).message}. Reply with a single JSON object.` });
      continue;
    }

    let shadowPromise: Promise<AgentStep | null> = Promise.resolve(null);
    if (opts.enableShadow && s.shadow) {
      const shadowProv = s.shadow;
      shadowPromise = (async () => {
        try {
          const res = await withTimeout(
            opts.gateway.chat({
              provider: shadowProv,
              model: modelFor(shadowProv, opts),
              messages,
              temperature: 0,
              responseFormat: "json_object",
            }),
            timeoutMs,
          );
          emit({ type: "shadow_step", data: { step, text: res.text, provider: shadowProv, latencyMs: res.latencyMs } });
          try {
            return parseStep(step, res.text);
          } catch {
            return null;
          }
        } catch (err) {
          emit({ type: "shadow_step", data: { step, error: (err as Error).message, provider: shadowProv } });
          return null;
        }
      })();
    }

    appendStep(s, parsedPrimary);

    if (parsedPrimary.action === "report") {
      const md = String(parsedPrimary.args.markdown ?? "");
      finalize(s, md);
      emit({ type: "incident_done", data: { report_md: md } });
      return s;
    }

    emit({ type: "tool_call", data: { step, tool: parsedPrimary.action, args: parsedPrimary.args } });
    if (parsedPrimary.action === "read_incident_kb") {
      emit({ type: "kb_lookup_started", data: { step, query: String(parsedPrimary.args.query ?? "") } });
    }
    const toolResult = await opts.pool.invoke({ step, tool: parsedPrimary.action, args: parsedPrimary.args });
    appendToolResult(s, toolResult);
    emit({ type: "tool_result", data: { step, status: toolResult.status, result: toolResult.result } });
    if (parsedPrimary.action === "read_incident_kb" && toolResult.status === "ok") {
      const r = toolResult.result as { incidents?: Array<{ incident_id: string }> } | null;
      const incidents = r?.incidents ?? [];
      emit({
        type: "kb_lookup_result",
        data: {
          step,
          hit_count: incidents.length,
          top_ids: incidents.slice(0, 3).map((x) => x.incident_id),
        },
      });
    }

    const shadowStep = await shadowPromise;
    if (shadowStep) {
      const div = compareSteps(step, parsedPrimary, shadowStep);
      emit({ type: "divergence", data: div as unknown as Record<string, unknown> });
    }
  }

  finalize(s, "# Investigation incomplete\nMax steps reached without a report.");
  emit({ type: "incident_done", data: { report_md: s.finalReport } });
  return s;
}

function modelFor(provider: ProviderName, opts: ConductorOpts): string {
  return provider === "claude" ? opts.primaryModel : opts.shadowModel;
}

function buildMessages(s: IncidentState, finalStep = false) {
  const nudge = finalStep
    ? `\n\nThis is your FINAL allowed step. You MUST reply with action="report" and a markdown summary in args.markdown covering: most likely root cause, supporting evidence from your investigation, and recommended remediation. Do not call any other tool.`
    : "";
  return [
    { role: "system" as const, content: s.messages[0]!.content },
    {
      role: "user" as const,
      content: `Current incident: ${s.id}.\nHistory so far:\n${renderHistory(s) || "(no steps yet)"}\n\nDecide your next single action and reply with a JSON object.${nudge}`,
    },
    ...s.messages.slice(1),
  ];
}

function parseStep(index: number, raw: string): AgentStep {
  const trimmed = stripCodeFence(raw).trim();
  const parsed = JSON.parse(trimmed) as { action: string; args?: Record<string, unknown>; rationale?: string; hypotheses?: string[] };
  const validActions: AgentAction[] = ["search_logs", "query_metrics", "query_traces", "read_runbook", "read_incident_kb", "report"];
  if (!validActions.includes(parsed.action as AgentAction)) {
    throw new Error(`invalid action "${parsed.action}"`);
  }
  return {
    index,
    action: parsed.action as AgentAction,
    args: parsed.args ?? {},
    rationale: parsed.rationale ?? "",
    hypotheses: parsed.hypotheses ?? [],
  };
}

function stripCodeFence(s: string): string {
  const match = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  return match ? match[1]! : s;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout ${ms}ms`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}
