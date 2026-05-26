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
  provenance?: "argus" | "historical";
}

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86400_000).toISOString();
}

const SEEDS: Seed[] = [
  {
    incident_id: "worker-oom-2024-q4-001",
    title: "Worker heap leak under heavy enqueue",
    report_md: [
      "# Summary",
      "Worker pool began OOM-killing every ~6 minutes under nominal enqueue rate, backing the job queue to ~12k pending before mitigation.",
      "",
      "# Timeline",
      "| time | event |",
      "|------|-------|",
      "| T+00:00 | alert: `worker.heap_used` > 92% |",
      "| T+06:00 | first OOM kill on `worker-3` |",
      "| T+13:00 | on-call paged; heap traced as monotonic |",
      "| T+25:00 | hypothesis confirmed: `flush_buffer()` never called |",
      "| T+42:00 | rolling restart; queue draining |",
      "",
      "# Root Cause",
      "A defensive `try/except` block in the worker loop swallowed the only path that called `flush_buffer()`. Heap walked monotonically from ~1.2 GB to OOM (~4 GB) over six minutes per worker.",
      "",
      "# Remediation",
      "Hot-restarted the worker pool to drain the queue, then shipped a patch removing the swallowing except, adding a `job_buffer.size` metric, and alerting at 50 MB.",
    ].join("\n"),
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
    report_md: [
      "# Summary",
      "`/process` endpoint started issuing 60+ serial queries per request after a feature flag flip. `db_proxy` connection pool saturated within 4 minutes; failover to read replica restored serving while a query batch shipped.",
      "",
      "# Timeline",
      "| time | event |",
      "|------|-------|",
      "| T+00:00 | feature flag `process.fanout_v2` rolled to 100% |",
      "| T+03:30 | alert: `db_proxy.pool_wait_ms` p95 > 1500ms |",
      "| T+05:00 | api 5xx rate climbing; pages on-call |",
      "| T+11:00 | trace shows N+1: one query per child row |",
      "| T+18:00 | failover to read replica; api recovered |",
      "| T+47:00 | batched query patch deployed; flag re-enabled |",
      "",
      "# Root Cause",
      "The new fanout code path lazy-loaded child entities inside a loop instead of preloading. Under production fan-out (avg 47 children/request), each request hit the pool 60+ times.",
      "",
      "# Remediation",
      "Failed over to read replica for immediate relief, then shipped a single batched query using `WHERE id IN (...)`. Added pool-wait alerting and a static lint rule against lazy fetch inside loops.",
    ].join("\n"),
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
    report_md: [
      "# Summary",
      "Auth service emitted bursts of `401 invalid_token` every 5 minutes for ~40 minutes. Caused by a TTL mismatch between the local token cache and the upstream rotation window.",
      "",
      "# Timeline",
      "| time | event |",
      "|------|-------|",
      "| T+00:00 | alert: `auth.401_rate` > 8% on 5m window |",
      "| T+04:00 | second burst confirms periodicity, not random |",
      "| T+15:00 | on-call correlates pattern with `auth.rotate_keys` cron |",
      "| T+22:00 | TTL bug confirmed: cache=10m, rotation=5m |",
      "| T+34:00 | cache TTL raised to 30s below rotation; bursts stop |",
      "",
      "# Root Cause",
      "Token cache TTL (10 min) exceeded the upstream key rotation interval (5 min). After each rotation, the cache served stale public keys until natural eviction — every request validating with the old key hit a 401.",
      "",
      "# Remediation",
      "Lowered TTL to 4m30s (rotation interval minus a safety margin). Added a webhook from the rotation service to proactively invalidate the cache. Runbook updated.",
    ].join("\n"),
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
    report_md: [
      "# Summary",
      "AZ-level network partition cut the worker pool off from `db_proxy` for ~12 minutes. Jobs piled up; cross-AZ failover restored throughput before SLO breach.",
      "",
      "# Timeline",
      "| time | event |",
      "|------|-------|",
      "| T+00:00 | spike in `worker.db_timeout_count`; jobs retrying |",
      "| T+02:00 | cloud provider posts partition advisory for us-east-1c |",
      "| T+05:00 | on-call confirms only AZ-c workers affected |",
      "| T+09:00 | initiate failover: drain c, route to a/b |",
      "| T+12:00 | partition resolved upstream; AZ-c re-enrolled |",
      "",
      "# Root Cause",
      "Upstream provider network event between us-east-1c and the db_proxy fleet. Workers in AZ-c lost connectivity; AZ-a and AZ-b were unaffected. Not a service-side defect.",
      "",
      "# Remediation",
      "Manual failover drained AZ-c workers and pinned scheduling to a/b. Followed up by lowering the cross-AZ failover trigger from 10m to 3m and adding pre-baked DNS for the replica fleet.",
    ].join("\n"),
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
    report_md: [
      "# Summary",
      "One api pod served the previous day's rate-limit config for ~16 hours after a botched rolling restart, causing intermittent 429s for a subset of clients.",
      "",
      "# Timeline",
      "| time | event |",
      "|------|-------|",
      "| T+00:00 | low-priority alert: `rate_limit.dropped` mildly elevated |",
      "| T+04:00 | customer reports sporadic 429s from one IP range |",
      "| T+09:00 | triage: only 1/12 pods returning unexpected limits |",
      "| T+13:00 | confirmed: `api-7` skipped during yesterday's restart |",
      "| T+15:00 | targeted pod restart; metrics normalize |",
      "",
      "# Root Cause",
      "Yesterday's deploy script aborted halfway through the rolling restart loop and didn't retry. `api-7` continued running with the prior ConfigMap mount; subsequent reads of the new ConfigMap silently went to disk-cache.",
      "",
      "# Remediation",
      "Restarted `api-7`. Patched the deploy script to abort-and-page on partial completion. Added a `config_version_mismatch` gauge that fires when pods disagree.",
    ].join("\n"),
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
    report_md: [
      "# Summary",
      "Worker pool hit OOM ~22 minutes after a tracing-collector outage. The in-memory span buffer grew unbounded while collector retries kept failing.",
      "",
      "# Timeline",
      "| time | event |",
      "|------|-------|",
      "| T+00:00 | upstream tracing collector becomes unreachable |",
      "| T+08:00 | `worker.trace_buffer_size` doubles every ~2m |",
      "| T+18:00 | first worker OOM |",
      "| T+22:00 | on-call drops tracing sample rate to 0 |",
      "| T+35:00 | collector restored; bounded buffer patch shipped |",
      "",
      "# Root Cause",
      "Tracing collector outage triggered the worker's local span buffer to retain spans pending retry. The buffer had no upper bound; under steady load it grew at ~120 MB/min until heap exhaustion.",
      "",
      "# Remediation",
      "Emergency sample-rate drop bought time. Patched the tracing client to enforce a 256 MB ring buffer with drop-oldest. Flushed every 5s instead of every 30s.",
    ].join("\n"),
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
    report_md: [
      "# Summary",
      "`db_proxy` p99 latency crossed 4s after a routine job-cleanup cron began full-table scans. Caused by a missing index on `jobs.created_at` after a migration dropped it inadvertently.",
      "",
      "# Timeline",
      "| time | event |",
      "|------|-------|",
      "| T+00:00 | alert: `db_proxy.slow_query_rate` > baseline x10 |",
      "| T+05:00 | logs surface repeated 'Using filesort' warnings |",
      "| T+13:00 | `EXPLAIN` confirms full scan on `jobs` table |",
      "| T+18:00 | migration history shows index drop in 2025-q1-002 |",
      "| T+30:00 | `CREATE INDEX CONCURRENTLY` complete; latency normalizes |",
      "",
      "# Root Cause",
      "Migration `2025-q1-002` (column rename) was authored with a side-effect drop of `idx_jobs_created_at`. The cleanup cron's `WHERE created_at < NOW() - INTERVAL '7 days'` then performed a 12M-row scan every 5 minutes.",
      "",
      "# Remediation",
      "Recreated the index online (`CONCURRENTLY`). Added a migration-review checklist item: 'lists every dropped index'. Backfilled CI to fail on un-acked index drops.",
    ].join("\n"),
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
    report_md: [
      "# Summary",
      "Worker CPU pinned at 100% for ~28 minutes after a customer pushed log lines that triggered catastrophic regex backtracking in the parser.",
      "",
      "# Timeline",
      "| time | event |",
      "|------|-------|",
      "| T+00:00 | alert: `worker.cpu` saturated; queue depth climbing |",
      "| T+04:00 | profiler attached; 94% of samples in `re.match` |",
      "| T+12:00 | offending line isolated: 8KB of repeating `a*` followed by `b` |",
      "| T+18:00 | regex flagged via `re2` static analysis: exponential worst case |",
      "| T+28:00 | regex replaced with linear scanner; CPU recovers |",
      "",
      "# Root Cause",
      "The log-line parser used a Python `re` regex with nested quantifiers (`(a+)+b`) — exponential backtracking on adversarial input. A customer happened to push synthetic logs matching the pathological shape.",
      "",
      "# Remediation",
      "Replaced the parser with a hand-rolled linear scanner. Added `re2` as the default regex engine for untrusted input. Added a max-input-length guard at the parser entry.",
    ].join("\n"),
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
    report_md: [
      "# Summary",
      "Slow memory growth on the api pods over ~3 days culminated in two OOM kills before mitigation. Caused by an unbounded response cache keyed on the full query string.",
      "",
      "# Timeline",
      "| time | event |",
      "|------|-------|",
      "| T-72:00 | `api.heap_used` begins steady upward drift |",
      "| T+00:00 | first OOM kill on `api-4` |",
      "| T+04:00 | second OOM kill; pages on-call |",
      "| T+09:00 | heap profile shows `response_cache` dict holding 4.2M entries |",
      "| T+22:00 | LRU bound deployed; heap stabilizes |",
      "",
      "# Root Cause",
      "The response cache used the full query string as a key. Pagination tokens and timestamps made every key effectively unique. Cache never evicted, growing ~140 MB/day across the fleet.",
      "",
      "# Remediation",
      "Wrapped the cache in a 10k-entry LRU. Added a `response_cache.size` metric and an alert at 8k. Reviewed all other in-process caches for similar unbounded patterns.",
    ].join("\n"),
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
    report_md: [
      "# Summary",
      "Upstream OIDC provider's signing certificate expired at midnight; auth started rejecting all tokens. Failover to the secondary IdP restored login while the cert rotated.",
      "",
      "# Timeline",
      "| time | event |",
      "|------|-------|",
      "| T+00:00 | midnight: cert `oidc.partner.com` expires |",
      "| T+00:30 | auth begins rejecting tokens: 'cert verify failed' |",
      "| T+02:00 | on-call paged; correlated with cert validity |",
      "| T+06:00 | failover to secondary IdP enabled |",
      "| T+38:00 | partner rotates cert; primary IdP re-enrolled |",
      "",
      "# Root Cause",
      "Upstream OIDC partner let their JWKS signing cert expire. Our auth service had no `not_after` pre-check; it discovered the expiry only via verification failures on live traffic.",
      "",
      "# Remediation",
      "Configured the secondary IdP as a failover path with 30s health-check. Added a daily cron that fetches and validates partner JWKS, paging if any cert expires within 7 days.",
    ].join("\n"),
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
    report_md: [
      "# Summary",
      "Gateway upstream timeout dropped to 1s in a copy-paste config error, causing cascading retries and a spurious failover to a degraded provider for ~18 minutes.",
      "",
      "# Timeline",
      "| time | event |",
      "|------|-------|",
      "| T+00:00 | gateway config deploy: `upstream_timeout_ms=1000` (was 3000) |",
      "| T+02:00 | api p99 normally 1.4s; now flagged as timeout |",
      "| T+05:00 | retry storm: 3x normal QPS to api |",
      "| T+11:00 | cascading failover engages secondary provider |",
      "| T+18:00 | config rolled back; failover undone |",
      "",
      "# Root Cause",
      "A reviewer suggested 1000ms based on a different upstream's profile; the change was applied wholesale. Api's p99 is legitimately ~1.4s under normal load, well above the new ceiling.",
      "",
      "# Remediation",
      "Rolled back to 3s. Added a config-validator that compares proposed timeouts against the upstream's measured p99 over the previous 7 days. Required PR template field: 'justification per upstream'.",
    ].join("\n"),
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
    report_md: [
      "# Summary",
      "A single customer submitted a job batch 10x normal size; the worker tried to load it whole, blew through heap, and OOM'd every retry until the batch was split.",
      "",
      "# Timeline",
      "| time | event |",
      "|------|-------|",
      "| T+00:00 | customer submits batch with 47k items (typical: ~4k) |",
      "| T+02:00 | first OOM on worker-1; retry picks up the same batch |",
      "| T+04:00 | three more workers OOM in retry rotation |",
      "| T+08:00 | failover routes batch processing to high-mem pool |",
      "| T+19:00 | batch-size cap deployed; high-mem pool drained |",
      "",
      "# Root Cause",
      "Workers loaded entire batches into memory before processing. No upper bound on batch size at the api ingestion layer; the customer's job was technically valid but pathological.",
      "",
      "# Remediation",
      "Emergency: routed oversized batches to a high-memory worker pool. Permanent: added a 10k-item cap at api ingestion with auto-chunking, and switched workers to streaming batch processing.",
    ].join("\n"),
    scenario: "worker-oom",
    failed_over: true,
    severity: "sev2",
    resolved_at: daysAgo(1),
    services_touched: ["worker", "api"],
    tool_log_digest: "search_logs->OOM kill; query_metrics->heap saturation.",
  },
];

async function main(): Promise<void> {
  // Flags:
  //   --refresh   Update the markdown of already-ingested seeds in place,
  //               via /admin/incident/<id>/refresh-content. Cheap, no LLM
  //               cost, doesn't perturb the entity graph.
  //   <id...>     Filter to specific incident ids (substring match).
  //
  // Default (no flags): full ingest via /admin/ingest.
  const args = process.argv.slice(2);
  const refreshOnly = args.includes("--refresh");
  const filters = args.filter((a) => !a.startsWith("--"));

  const targets = filters.length
    ? SEEDS.filter((s) => filters.some((f) => s.incident_id.includes(f)))
    : SEEDS;

  if (targets.length === 0) {
    console.error(`no seeds match: ${filters.join(", ")}`);
    process.exit(1);
  }

  let ok = 0;
  let fail = 0;
  for (const seed of targets) {
    const payload = { ...seed, provenance: seed.provenance ?? "historical" };
    const url = refreshOnly
      ? `${ADMIN}/admin/incident/${encodeURIComponent(seed.incident_id)}/refresh-content`
      : `${ADMIN}/admin/ingest`;
    process.stdout.write(`  -> ${seed.incident_id} ${refreshOnly ? "(refresh)" : ""} ... `);
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
      const j = (await r.json()) as Record<string, unknown>;
      console.log(refreshOnly ? `ok (updated=${j.updated})` : `ok (${j.job_id})`);
      ok += 1;
    } catch (err) {
      console.log(`FAIL: ${(err as Error).message}`);
      fail += 1;
    }
    // Refresh is just Cypher, no LLM throttling needed; full ingest needs
    // breathing room for the worker's per-incident rate-limit window.
    if (!refreshOnly) await new Promise((res) => setTimeout(res, 5000));
  }
  const verb = refreshOnly ? "refreshed" : "queued";
  console.log(`\n${verb} ${ok}/${targets.length} incidents (${fail} failures)`);
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
