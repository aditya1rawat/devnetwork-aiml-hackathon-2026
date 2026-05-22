export type EventName =
  | "step_start"
  | "primary_step"
  | "shadow_step"
  | "tool_call"
  | "tool_result"
  | "divergence"
  | "failover"
  | "gateway_mode"
  | "incident_done";

export interface StreamEvent {
  type: EventName;
  data: Record<string, unknown>;
}
