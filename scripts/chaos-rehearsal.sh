#!/usr/bin/env bash
set -euo pipefail
ORCH="${ORCHESTRATOR_URL:-http://127.0.0.1:7200}"
echo "rehearsal — will fire chaos against the active incident"

sleep 25 && echo "T+25: kill Claude" && curl -fsS -X POST "$ORCH/chaos/kill-provider" -H 'content-type: application/json' -d '{"provider":"claude"}' >/dev/null
sleep 30 && echo "T+55: sever Gateway" && curl -fsS -X POST "$ORCH/chaos/sever-gateway" >/dev/null
sleep 30 && echo "T+85: restore Gateway" && curl -fsS -X POST "$ORCH/chaos/restore-gateway" >/dev/null
sleep 15 && echo "T+100: restore Claude" && curl -fsS -X POST "$ORCH/chaos/restore-provider" -H 'content-type: application/json' -d '{"provider":"claude"}' >/dev/null
