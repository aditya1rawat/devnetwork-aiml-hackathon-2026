#!/usr/bin/env bash
# Seed the KB one incident at a time with live progress logging. Queues each
# seed, then polls /admin/ingest/status/<id> until state=done|failed before
# moving on. Prints extraction-call counter, elapsed seconds, and cumulative
# Neo4j Episodic count after each completion.
#
# Usage: ./scripts/seed-kb-verbose.sh
#        ADMIN_URL=http://localhost:7301 ./scripts/seed-kb-verbose.sh
set -euo pipefail

ADMIN_URL="${ADMIN_URL:-${INCIDENT_KB_ADMIN_URL:-http://localhost:7301}}"

SEEDS=(
  worker-oom-2024-q4-001
  db-saturation-2024-q4-002
  auth-flap-2024-q4-003
  network-partition-2024-q4-004
  config-drift-2024-q4-005
  worker-oom-2025-q1-006
  db-saturation-2025-q1-007
  cpu-saturation-2025-q1-008
  memleak-2025-q1-009
  auth-failure-2025-q1-010
  config-drift-2025-q1-011
  worker-oom-2025-q1-012
)

TOTAL=${#SEEDS[@]}
i=0
for id in "${SEEDS[@]}"; do
  i=$((i+1))
  printf "[%2d/%d] queueing %s ... " "$i" "$TOTAL" "$id"

  # The repo's existing TS seeder accepts a single-id filter — reuse it so
  # the payload stays in lockstep with scripts/seed-kb.ts.
  out=$(INCIDENT_KB_ADMIN_URL="$ADMIN_URL" pnpm seed-kb "$id" 2>&1 | grep -E "(ok|FAIL)" | head -1 || true)
  if [[ "$out" != *ok* ]]; then
    echo "FAIL queueing: $out"
    continue
  fi
  echo "queued"

  # Poll until the ingest worker finishes this incident.
  start=$(date +%s)
  while true; do
    json=$(curl -sf "$ADMIN_URL/admin/ingest/status/$id" 2>/dev/null || echo '{"state":"unknown"}')
    state=$(python3 -c "import sys,json; print(json.loads(sys.argv[1]).get('state','?'))" "$json")
    if [[ "$state" == "done" || "$state" == "failed" ]]; then
      details=$(python3 -c "
import sys, json
d = json.loads(sys.argv[1])
calls = d.get('extraction_calls', 0)
elapsed = d.get('elapsed_s', 0)
err = d.get('last_error', '') or ''
print(f'{calls} extractions in {elapsed:.1f}s' + (f' err: {err[:80]}' if err else ''))
" "$json")
      count=$(curl -sf "$ADMIN_URL/incidents?provenance=historical" | python3 -c "import sys, json; print(len(json.load(sys.stdin)['incidents']))")
      printf "        %s %s · kb episodic count: %d\n" "$([ "$state" == "done" ] && echo "✓" || echo "✗")" "$details" "$count"
      break
    fi
    sleep 2
  done
done

echo
echo "done. final episodic count:"
curl -sf "$ADMIN_URL/incidents?provenance=historical" | python3 -c "import sys, json; d=json.load(sys.stdin); print(f'{len(d[\"incidents\"])} historical')"
