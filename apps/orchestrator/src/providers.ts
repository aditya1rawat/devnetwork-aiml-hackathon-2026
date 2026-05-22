import type { ProviderName, ProviderState } from "./types.js";

export interface ProviderRegistryOpts {
  quarantineMs: number;
}

export class ProviderRegistry {
  private state: Map<ProviderName, ProviderState>;
  private latencies: Map<ProviderName, number[]> = new Map();
  private quarantineMs: number;

  constructor(providers: ProviderName[], opts: ProviderRegistryOpts) {
    this.quarantineMs = opts.quarantineMs;
    this.state = new Map(
      providers.map((p) => [
        p,
        {
          name: p,
          health: "healthy" as const,
          lastFailureAt: null,
          quarantineUntil: null,
          p95LatencyMs: 0,
          baselineLatencyMs: 0,
        },
      ]),
    );
  }

  list(): ProviderName[] {
    return [...this.state.keys()];
  }

  isHealthy(name: ProviderName): boolean {
    const s = this.state.get(name);
    if (!s) return false;
    if (s.quarantineUntil !== null && Date.now() < s.quarantineUntil) return false;
    return true;
  }

  healthy(): ProviderName[] {
    return this.list().filter((p) => this.isHealthy(p));
  }

  markFailure(name: ProviderName, at: number): void {
    const s = this.state.get(name);
    if (!s) return;
    s.health = "quarantined";
    s.lastFailureAt = at;
    s.quarantineUntil = at + this.quarantineMs;
  }

  markSuccess(name: ProviderName): void {
    const s = this.state.get(name);
    if (!s) return;
    s.health = "healthy";
    s.quarantineUntil = null;
  }

  recordLatency(name: ProviderName, ms: number): void {
    const buf = this.latencies.get(name) ?? [];
    buf.push(ms);
    while (buf.length > 50) buf.shift();
    this.latencies.set(name, buf);
    const s = this.state.get(name);
    if (s) {
      if (s.baselineLatencyMs === 0) s.baselineLatencyMs = ms;
      s.p95LatencyMs = this.percentile(buf, 0.95);
    }
  }

  brownout(name: ProviderName): boolean {
    const s = this.state.get(name);
    if (!s || s.baselineLatencyMs === 0) return false;
    return s.p95LatencyMs > 3 * s.baselineLatencyMs;
  }

  tick(now: number): void {
    for (const s of this.state.values()) {
      if (s.quarantineUntil !== null && now >= s.quarantineUntil) {
        s.quarantineUntil = null;
        s.health = "healthy";
      }
    }
  }

  private percentile(values: number[], p: number): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
    return sorted[idx]!;
  }
}
