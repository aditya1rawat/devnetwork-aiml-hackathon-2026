export type ProviderName = "claude" | "nemotron";

export type ProviderHealth = "healthy" | "quarantined" | "brownout";

export interface ProviderState {
  name: ProviderName;
  health: ProviderHealth;
  lastFailureAt: number | null;
  quarantineUntil: number | null;
  p95LatencyMs: number;
  baselineLatencyMs: number;
}

export interface AgentStep {
  index: number;
  action: AgentAction;
  args: Record<string, unknown>;
  rationale: string;
  hypotheses: string[];
}

export type AgentAction =
  | "search_logs"
  | "query_metrics"
  | "query_traces"
  | "read_runbook"
  | "read_incident_kb"
  | "report";

export interface ToolCallRecord {
  step: number;
  tool: string;
  args: Record<string, unknown>;
  result: unknown;
  durationMs: number;
  status: "ok" | "error" | "synthetic";
}

export interface IncidentState {
  id: string;
  startedAt: number;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  toolLog: ToolCallRecord[];
  scratchpad: string;
  hypotheses: string[];
  steps: AgentStep[];
  primary: ProviderName;
  shadow: ProviderName | null;
  finalReport: string | null;
}

export interface DivergenceScore {
  step: number;
  cosine: number;
  actionMismatch: boolean;
  argsMismatch: boolean;
  agreement: number;
  flagged: boolean;
  summary: string;
}
