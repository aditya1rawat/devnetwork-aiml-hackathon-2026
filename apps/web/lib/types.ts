export type EventName =
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

export interface StreamEvent {
  type: EventName;
  data: Record<string, unknown>;
}
