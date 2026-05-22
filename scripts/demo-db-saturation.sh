#!/usr/bin/env bash
set -euo pipefail
CLUSTER="${MOCK_CLUSTER_URL:-http://127.0.0.1:7100}"
ORCH="${ORCHESTRATOR_URL:-http://127.0.0.1:7200}"
ID="${1:-demo-db-saturation-$(date +%s)}"

echo "→ inject slow_query on db_proxy"
curl -fsS -X POST "$CLUSTER/chaos/inject" \
  -H 'content-type: application/json' \
  -d '{"type":"slow_query","target":"db_proxy","duration_s":120,"params":{"ms":1500}}' >/dev/null

echo "→ generating load on api → db_proxy"
for i in {1..30}; do
  curl -fsS "http://127.0.0.1:7101/process/job_$i" >/dev/null &
done
sleep 3

echo "→ start incident $ID"
curl -fsS -X POST "$ORCH/incident/$ID/start" >/dev/null

echo "→ open http://localhost:3000/incident/$ID"
echo "$ID"
