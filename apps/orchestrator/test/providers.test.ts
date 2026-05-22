import { describe, it, expect, beforeEach } from "vitest";
import {
  ProviderRegistry,
} from "../src/providers.js";

describe("ProviderRegistry", () => {
  let reg: ProviderRegistry;
  beforeEach(() => {
    reg = new ProviderRegistry(["claude", "nemotron"], { quarantineMs: 60_000 });
  });

  it("starts all providers healthy", () => {
    expect(reg.healthy()).toEqual(["claude", "nemotron"]);
  });

  it("quarantines a provider on failure", () => {
    reg.markFailure("claude", Date.now());
    expect(reg.healthy()).toEqual(["nemotron"]);
    expect(reg.isHealthy("claude")).toBe(false);
  });

  it("recovers from quarantine after window", () => {
    const now = Date.now();
    reg.markFailure("claude", now);
    expect(reg.isHealthy("claude")).toBe(false);
    reg.tick(now + 60_001);
    expect(reg.isHealthy("claude")).toBe(true);
  });

  it("flags brownout when p95 > 3x baseline", () => {
    reg.recordLatency("claude", 100);
    reg.recordLatency("claude", 100);
    reg.recordLatency("claude", 100);
    expect(reg.brownout("claude")).toBe(false);
    reg.recordLatency("claude", 500);
    expect(reg.brownout("claude")).toBe(true);
  });
});
