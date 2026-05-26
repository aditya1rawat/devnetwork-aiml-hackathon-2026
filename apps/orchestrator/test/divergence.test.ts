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
  it("identical → not flagged, agreement ~1", () => {
    const r = compareSteps(0, baseStep, baseStep);
    expect(r.actionMismatch).toBe(false);
    expect(r.argsMismatch).toBe(false);
    expect(r.flagged).toBe(false);
    expect(r.agreement).toBeGreaterThan(0.95);
  });

  it("different action + divergent rationale → flagged", () => {
    const r = compareSteps(0, baseStep, {
      ...baseStep,
      action: "query_metrics",
      rationale: "check CPU saturation on database proxy nodes",
    });
    expect(r.actionMismatch).toBe(true);
    expect(r.flagged).toBe(true);
    expect(r.agreement).toBeLessThan(0.35);
  });

  it("different action but aligned rationale → not flagged (parallel exploration)", () => {
    const r = compareSteps(0, baseStep, { ...baseStep, action: "query_metrics" });
    expect(r.actionMismatch).toBe(true);
    expect(r.flagged).toBe(false);
    expect(r.agreement).toBeGreaterThan(0.35);
  });

  it("same action different args same rationale → flagged false, argsMismatch true", () => {
    const r = compareSteps(0, baseStep, { ...baseStep, args: { service: "api", q: "OOM" } });
    expect(r.actionMismatch).toBe(false);
    expect(r.argsMismatch).toBe(true);
    expect(r.flagged).toBe(false);
    expect(r.agreement).toBeGreaterThan(0.5);
  });

  it("similar rationale, same action+args → not flagged, high agreement", () => {
    const r = compareSteps(0, baseStep, { ...baseStep, rationale: "investigate OOM hits in worker" });
    expect(r.actionMismatch).toBe(false);
    expect(r.argsMismatch).toBe(false);
    expect(r.flagged).toBe(false);
    expect(r.agreement).toBeGreaterThan(0.6);
  });
});
