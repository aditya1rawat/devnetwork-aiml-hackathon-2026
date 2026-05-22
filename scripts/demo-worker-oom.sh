#!/usr/bin/env bash
set -euo pipefail
CLUSTER="${MOCK_CLUSTER_URL:-http://127.0.0.1:7100}"
ORCH="${ORCHESTRATOR_URL:-http://127.0.0.1:7200}"
ID="${1:-demo-worker-oom-$(date +%s)}"

echo "→ inject memleak on worker"
curl -fsS -X POST "$CLUSTER/chaos/inject" \
  -H 'content-type: application/json' \
  -d '{"type":"memleak","target":"worker","duration_s":120,"params":{"mb_per_tick":120}}' >/dev/null

echo "→ wait for OOM (about 10 s)"
sleep 12

echo "→ start incident $ID"
curl -fsS -X POST "$ORCH/incident/$ID/start" >/dev/null

echo "→ open http://localhost:3000/incident/$ID"
echo "$ID"
