import { describe, it, expect, vi, beforeEach } from "vitest";
import { IncidentKbClient } from "../src/incident-kb-client.js";

describe("IncidentKbClient", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("posts ingest bundle and returns job_id", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ job_id: "ingest-abc", status: "queued" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const c = new IncidentKbClient("http://localhost:7301");
    const out = await c.ingest({
      incident_id: "x",
      title: "t",
      report_md: "md",
      scenario: null,
      failed_over: false,
      severity: "sev2",
      resolved_at: "2026-01-01T00:00:00Z",
      services_touched: [],
      tool_log_digest: "",
    });

    expect(out.job_id).toBe("ingest-abc");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:7301/admin/ingest",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("fetches case graph", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ nodes: [], edges: [], focus_id: "x" }),
    }));

    const c = new IncidentKbClient("http://localhost:7301");
    const g = await c.caseGraph("worker-oom-1");
    expect(g.focus_id).toBe("x");
  });

  it("throws on non-2xx", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "boom",
    }));
    const c = new IncidentKbClient("http://localhost:7301");
    await expect(c.reset()).rejects.toThrow(/kb reset failed/i);
  });
});
