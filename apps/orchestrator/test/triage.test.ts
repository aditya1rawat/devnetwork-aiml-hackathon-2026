import { describe, it, expect, vi } from "vitest";
import { buildApp } from "../src/server.js";

function appWith(chat: (...args: unknown[]) => unknown) {
  const deps = {
    gateway: { chat } as never,
    pool: {} as never,
    registry: {} as never,
    chaosState: { killClaude: false, killNemotron: false, gatewayDown: false },
    kb: null,
  };
  return buildApp(deps).app;
}

function post(app: ReturnType<typeof appWith>, scenario: unknown) {
  return app.request("/triage", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ scenario }),
  });
}

describe("POST /triage", () => {
  it("returns parsed diagnosis from the model", async () => {
    const chat = vi.fn(async () => ({
      text: JSON.stringify({ diagnosis: "Heap climbing on worker-3.", suspectedRootCause: "memory leak" }),
      latencyMs: 5,
      provider: "claude",
      via: "gateway",
    }));
    const res = await post(appWith(chat), "worker-oom");
    expect(res.status).toBe(200);
    const j = (await res.json()) as { diagnosis: string; suspectedRootCause: string };
    expect(j.diagnosis).toContain("Heap climbing");
    expect(j.suspectedRootCause).toBe("memory leak");
    expect(chat).toHaveBeenCalledTimes(1);
  });

  it("404 on unknown scenario", async () => {
    const res = await post(appWith(vi.fn()), "nope");
    expect(res.status).toBe(404);
  });

  it("falls back to scenario data when the model errors", async () => {
    const chat = vi.fn(async () => {
      throw new Error("boom");
    });
    const res = await post(appWith(chat), "auth-5xx");
    expect(res.status).toBe(200);
    const j = (await res.json()) as { suspectedRootCause: string };
    expect(j.suspectedRootCause).toBe("error_5xx on auth");
  });

  it("falls back when the model returns incomplete JSON", async () => {
    const chat = vi.fn(async () => ({
      text: JSON.stringify({ diagnosis: "partial only" }),
      latencyMs: 5,
      provider: "claude",
      via: "gateway",
    }));
    const res = await post(appWith(chat), "db-saturation");
    expect(res.status).toBe(200);
    const j = (await res.json()) as { suspectedRootCause: string };
    expect(j.suspectedRootCause).toBe("slow_query on db_proxy");
  });
});
