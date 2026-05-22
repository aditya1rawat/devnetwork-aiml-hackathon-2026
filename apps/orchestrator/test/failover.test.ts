import { describe, it, expect } from "vitest";
import { promoteShadow, pickNewShadow } from "../src/failover.js";
import { ProviderRegistry } from "../src/providers.js";
import type { IncidentState } from "../src/types.js";

function fakeState(): IncidentState {
  return {
    id: "x",
    startedAt: 0,
    messages: [],
    toolLog: [],
    scratchpad: "",
    hypotheses: [],
    steps: [],
    primary: "claude",
    shadow: "nemotron",
    finalReport: null,
  };
}

describe("failover", () => {
  it("promoteShadow swaps primary/shadow", () => {
    const s = fakeState();
    promoteShadow(s);
    expect(s.primary).toBe("nemotron");
    expect(s.shadow).toBeNull();
  });

  it("pickNewShadow excludes current primary + quarantined", () => {
    const s = fakeState();
    s.primary = "nemotron";
    s.shadow = null;
    const reg = new ProviderRegistry(["claude", "nemotron"], { quarantineMs: 60_000 });
    reg.markFailure("claude", Date.now());
    const pick = pickNewShadow(s, reg);
    expect(pick).toBeNull();
  });

  it("pickNewShadow returns healthy alt", () => {
    const s = fakeState();
    s.primary = "nemotron";
    s.shadow = null;
    const reg = new ProviderRegistry(["claude", "nemotron"], { quarantineMs: 60_000 });
    const pick = pickNewShadow(s, reg);
    expect(pick).toBe("claude");
  });
});
