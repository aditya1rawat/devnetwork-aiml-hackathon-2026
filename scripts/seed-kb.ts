#!/usr/bin/env tsx
const ADMIN = process.env.INCIDENT_KB_ADMIN_URL ?? "http://localhost:7301";

interface Seed {
  incident_id: string;
  title: string;
  report_md: string;
  scenario: string | null;
  failed_over: boolean;
  severity: "sev1" | "sev2" | "sev3";
  resolved_at: string;
  services_touched: string[];
  tool_log_digest: string;
}

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86400_000).toISOString();
}

const SEEDS: Seed[] = [
  {
    incident_id: "worker-oom-2024-q4-001",
    title: "Worker heap leak under heavy enqueue",
    report_md: "# Root Cause\nWorker memory leak triggered by unflushed job buffer.\n# Remediation\nRestart worker; patch buffer flush.",
    scenario: "worker-oom",
    failed_over: false,
    severity: "sev2",
    resolved_at: daysAgo(58),
    services_touched: ["worker", "api"],
    tool_log_digest: "search_logs->buffer not flushing; query_metrics->heap monotonic.",
  },
  {
    incident_id: "db-saturation-2024-q4-002",
    title: "db_proxy saturated by N+1 query",
    report_md: "# Root Cause\nN+1 query in /process endpoint, 1.5s/request under load.\n# Remediation\nAdd query batch.",
    scenario: "db-saturation",
    failed_over: true,
    severity: "sev1",
    resolved_at: daysAgo(51),
    services_touched: ["db_proxy", "api"],
    tool_log_digest: "query_metrics->db_proxy p95 spike; query_traces->N+1 pattern.",
  },
  {
    incident_id: "auth-flap-2024-q4-003",
    title: "Auth service flapping on token rotation",
    report_md: "# Root Cause\nToken cache TTL shorter than rotation interval.\n# Remediation\nExtend cache TTL.",
    scenario: null,
    failed_over: false,
    severity: "sev2",
    resolved_at: daysAgo(44),
    services_touched: ["auth", "api"],
    tool_log_digest: "search_logs->auth 401 burst; read_runbook->token rotation.",
  },
  {
    incident_id: "network-partition-2024-q4-004",
    title: "Worker isolated from db_proxy",
    report_md: "# Root Cause\nTransient network partition between worker pool and db_proxy.\n# Remediation\nFailover and retry.",
    scenario: null,
    failed_over: true,
    severity: "sev1",
    resolved_at: daysAgo(38),
    services_touched: ["worker", "db_proxy"],
    tool_log_digest: "query_metrics->worker timeout spike.",
  },
  {
    incident_id: "config-drift-2024-q4-005",
    title: "Stale rate-limit config on api",
    report_md: "# Root Cause\nConfig drift: api held outdated rate-limit after rolling restart skipped one pod.\n# Remediation\nRedeploy api.",
    scenario: null,
    failed_over: false,
    severity: "sev3",
    resolved_at: daysAgo(31),
    services_touched: ["api"],
    tool_log_digest: "search_logs->rate-limit hits; read_runbook->config drift.",
  },
  {
    incident_id: "worker-oom-2025-q1-006",
    title: "Worker OOM under tracing buffer growth",
    report_md: "# Root Cause\nTracing buffer not draining.\n# Remediation\nLower buffer size, flush every 5s.",
    scenario: "worker-oom",
    failed_over: false,
    severity: "sev2",
    resolved_at: daysAgo(24),
    services_touched: ["worker"],
    tool_log_digest: "query_traces->tracing queue growing.",
  },
  {
    incident_id: "db-saturation-2025-q1-007",
    title: "db_proxy slow_query from missing index",
    report_md: "# Root Cause\nMissing index on jobs.created_at.\n# Remediation\nCreate index.",
    scenario: "db-saturation",
    failed_over: false,
    severity: "sev1",
    resolved_at: daysAgo(17),
    services_touched: ["db_proxy"],
    tool_log_digest: "query_metrics->slow_query rate up; search_logs->full scan warnings.",
  },
  {
    incident_id: "cpu-saturation-2025-q1-008",
    title: "Worker CPU pinned by regex hot loop",
    report_md: "# Root Cause\nRegex backtracking in log parser.\n# Remediation\nReplace regex with linear parser.",
    scenario: null,
    failed_over: false,
    severity: "sev2",
    resolved_at: daysAgo(13),
    services_touched: ["worker"],
    tool_log_digest: "query_metrics->worker cpu 100%; query_traces->hot loop.",
  },
  {
    incident_id: "memleak-2025-q1-009",
    title: "API service memleak via response cache",
    report_md: "# Root Cause\nUnbounded response cache on api.\n# Remediation\nAdd LRU bound.",
    scenario: null,
    failed_over: false,
    severity: "sev2",
    resolved_at: daysAgo(9),
    services_touched: ["api"],
    tool_log_digest: "query_metrics->api heap growth.",
  },
  {
    incident_id: "auth-failure-2025-q1-010",
    title: "Auth service outage from upstream cert expiry",
    report_md: "# Root Cause\nUpstream certificate expired.\n# Remediation\nRotate cert.",
    scenario: null,
    failed_over: true,
    severity: "sev1",
    resolved_at: daysAgo(5),
    services_touched: ["auth"],
    tool_log_digest: "search_logs->cert verify failed; read_runbook->cert rotation.",
  },
  {
    incident_id: "config-drift-2025-q1-011",
    title: "Gateway timeout config too aggressive",
    report_md: "# Root Cause\nGateway timeout 1s caused cascade failover.\n# Remediation\nRaise to 3s.",
    scenario: null,
    failed_over: false,
    severity: "sev2",
    resolved_at: daysAgo(3),
    services_touched: ["gateway", "api"],
    tool_log_digest: "query_metrics->gateway timeout count up.",
  },
  {
    incident_id: "worker-oom-2025-q1-012",
    title: "Worker OOM under large payload batch",
    report_md: "# Root Cause\nBatch size 10x normal exhausted heap.\n# Remediation\nCap batch size.",
    scenario: "worker-oom",
    failed_over: true,
    severity: "sev2",
    resolved_at: daysAgo(1),
    services_touched: ["worker", "api"],
    tool_log_digest: "search_logs->OOM kill; query_metrics->heap saturation.",
  },
];

async function main(): Promise<void> {
  let ok = 0;
  let fail = 0;
  for (const seed of SEEDS) {
    process.stdout.write(`  -> ${seed.incident_id} ... `);
    try {
      const r = await fetch(`${ADMIN}/admin/ingest`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(seed),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
      const j = (await r.json()) as { job_id: string };
      console.log(`ok (${j.job_id})`);
      ok += 1;
    } catch (err) {
      console.log(`FAIL: ${(err as Error).message}`);
      fail += 1;
    }
    await new Promise((res) => setTimeout(res, 5000));
  }
  console.log(`\nseeded ${ok}/${SEEDS.length} incidents (${fail} failures)`);
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
