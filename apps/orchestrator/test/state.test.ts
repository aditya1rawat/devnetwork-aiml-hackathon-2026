import { describe, it, expect } from "vitest";
import { createIncident, appendToolResult, appendStep, finalize } from "../src/state.js";

describe("IncidentState", () => {
  it("creates with sane defaults", () => {
    const s = createIncident("inc_1", "system prompt");
    expect(s.id).toBe("inc_1");
    expect(s.messages.length).toBe(1);
    expect(s.messages[0]!.role).toBe("system");
    expect(s.toolLog.length).toBe(0);
    expect(s.steps.length).toBe(0);
    expect(s.primary).toBe("claude");
    expect(s.shadow).toBe("nemotron");
  });

  it("appendStep adds to history", () => {
    const s = createIncident("inc_1", "sys");
    appendStep(s, { index: 0, action: "search_logs", args: { q: "OOM" }, rationale: "look for OOM", hypotheses: [] });
    expect(s.steps.length).toBe(1);
  });

  it("appendToolResult adds to log", () => {
    const s = createIncident("inc_1", "sys");
    appendToolResult(s, { step: 0, tool: "search_logs", args: { q: "OOM" }, result: { count: 3 }, durationMs: 12, status: "ok" });
    expect(s.toolLog.length).toBe(1);
  });

  it("finalize sets final report", () => {
    const s = createIncident("inc_1", "sys");
    finalize(s, "# Report");
    expect(s.finalReport).toBe("# Report");
  });
});
