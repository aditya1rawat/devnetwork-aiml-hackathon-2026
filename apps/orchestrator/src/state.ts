import type { AgentStep, IncidentState, ToolCallRecord } from "./types.js";

export function createIncident(id: string, systemPrompt: string): IncidentState {
  return {
    id,
    startedAt: Date.now(),
    messages: [{ role: "system", content: systemPrompt }],
    toolLog: [],
    scratchpad: "",
    hypotheses: [],
    steps: [],
    primary: "claude",
    shadow: "nemotron",
    finalReport: null,
  };
}

export function appendStep(s: IncidentState, step: AgentStep): void {
  s.steps.push(step);
}

export function appendToolResult(s: IncidentState, rec: ToolCallRecord): void {
  s.toolLog.push(rec);
}

export function finalize(s: IncidentState, reportMd: string): void {
  s.finalReport = reportMd;
}

export function renderHistory(s: IncidentState): string {
  const lines: string[] = [];
  for (const step of s.steps) {
    lines.push(`STEP ${step.index}: ${step.action} ${JSON.stringify(step.args)}`);
    lines.push(`  rationale: ${step.rationale}`);
    const tool = s.toolLog.find((t) => t.step === step.index);
    if (tool) lines.push(`  result(status=${tool.status}): ${JSON.stringify(tool.result).slice(0, 500)}`);
  }
  return lines.join("\n");
}
