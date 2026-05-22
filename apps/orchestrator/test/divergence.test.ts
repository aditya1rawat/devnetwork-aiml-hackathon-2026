import { describe, it, expect } from "vitest";
import { compareSteps } from "../src/divergence.js";
import type { AgentStep } from "../src/types.js";

const baseStep: AgentStep = {
  index: 0,
  action: "search_logs",
  args: { service: "worker", q: "OOM" },
  rationale: "look for OOM in worker logs",
  hypotheses: ["leak"],
};

describe("compareSteps", () => {
  it("identical → not flagged, high score", () => {
    const r = compareSteps(0, baseStep, baseStep);
    expect(r.actionMismatch).toBe(false);
    expect(r.argsMismatch).toBe(false);
    expect(r.flagged).toBe(false);
  });

  it("different action → flagged", () => {
    const r = compareSteps(0, baseStep, { ...baseStep, action: "query_metrics" });
    expect(r.actionMismatch).toBe(true);
    expect(r.flagged).toBe(true);
  });

  it("same action different args → args mismatch, flagged", () => {
    const r = compareSteps(0, baseStep, { ...baseStep, args: { service: "api", q: "OOM" } });
    expect(r.actionMismatch).toBe(false);
    expect(r.argsMismatch).toBe(true);
    expect(r.flagged).toBe(true);
  });

  it("similar rationale → not flagged on text alone", () => {
    const r = compareSteps(0, baseStep, { ...baseStep, rationale: "investigate OOM hits in worker" });
    expect(r.actionMismatch).toBe(false);
    expect(r.argsMismatch).toBe(false);
    expect(r.flagged).toBe(false);
  });
});
