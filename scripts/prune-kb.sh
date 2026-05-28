#!/usr/bin/env bash
# Prune duplicate argus-provenance incidents from the KB.
#
# Groups argus runs by scenario, keeps the N most recent per scenario, and
# DELETEs the rest via /admin/incident/{id}. Leaves provenance=historical
# (the original seed set) untouched. Shared entity nodes survive the delete;
# only the Episodic anchors are removed.
#
# Usage:
#   ./scripts/prune-kb.sh                  # dry-run, keep 2 newest per scenario
#   ./scripts/prune-kb.sh --apply          # actually delete
#   KEEP=3 ./scripts/prune-kb.sh --apply   # keep 3 newest per scenario
#   ADMIN_URL=http://localhost:7301 ./scripts/prune-kb.sh --apply
#
# Droplet note: KB admin (:7301) is internal-only behind Caddy. Either run
# this on the Droplet itself against http://localhost:7301, or tunnel:
#   ssh -L 7301:localhost:7301 root@64.23.239.2
set -euo pipefail

ADMIN_URL="${ADMIN_URL:-${INCIDENT_KB_ADMIN_URL:-http://localhost:7301}}"
KEEP="${KEEP:-2}"
APPLY=0
for arg in "$@"; do
  case "$arg" in
    --apply) APPLY=1 ;;
    -h|--help) sed -n '2,18p' "$0"; exit 0 ;;
    *) echo "unknown arg: $arg" >&2; exit 2 ;;
  esac
done

command -v jq >/dev/null || { echo "jq required" >&2; exit 1; }

echo "[prune-kb] admin=$ADMIN_URL keep=$KEEP apply=$APPLY"

raw="$(curl -fsS "$ADMIN_URL/incidents?provenance=argus")"
total=$(echo "$raw" | jq '.incidents | length')
echo "[prune-kb] argus incidents in KB: $total"

# Sort newest-first per scenario, keep first KEEP, emit rest as scenario\tid.
to_delete="$(echo "$raw" | jq -r --argjson keep "$KEEP" '
  .incidents
  | map(. + { scenario: (.scenario // "unknown") })
  | group_by(.scenario)
  | map(sort_by(.resolved_at) | reverse | .[$keep:])
  | flatten
  | .[]
  | "\(.scenario)\t\(.incident_id)\t\(.resolved_at)"
')"

if [ -z "$to_delete" ]; then
  echo "[prune-kb] nothing to delete"
  exit 0
fi

count=$(echo "$to_delete" | wc -l | tr -d ' ')
echo "[prune-kb] candidates to delete: $count"
echo "$to_delete" | awk -F'\t' '{printf "  - %-22s %-40s %s\n", $1, $2, $3}'

if [ "$APPLY" -ne 1 ]; then
  echo "[prune-kb] dry-run (pass --apply to delete)"
  exit 0
fi

echo "[prune-kb] deleting..."
while IFS=$'\t' read -r scenario id _; do
  resp="$(curl -fsS -X DELETE "$ADMIN_URL/admin/incident/$id")"
  deleted=$(echo "$resp" | jq -r '.deleted')
  printf "  deleted=%s %-22s %s\n" "$deleted" "$scenario" "$id"
done <<< "$to_delete"

echo "[prune-kb] done"
