# Demo Scenarios + Ops Board Design

**Date:** 2026-05-26
**Status:** Approved (design), pending implementation plan

## Goal

Replace the two bare demo scenarios (`worker-oom`, `db-saturation`) and the
"Launch Investigation" button with a richer, more natural demo: a set of 6
chaos scenarios surfaced through an **ops status board** hub plus **6 bespoke
product surfaces** (one fictional company, in distress) that each trigger an
Argus investigation in-context.

## Narrative

Argus (our brand: the autonomous SRE agent) monitors the production systems of
a **single fictional company**. The demo operator sees that company's product
in distress and triggers Argus to investigate. The 6 surfaces are different
screens of the same company app, sharing brand chrome (logo, nav, palette,
type), with distinct content per scenario.

## Scenario Set (6)

All scenarios use **real, wired chaos primitives** on **real mock-cluster
services** that emit investigable logs/metrics/traces. Covers all 6 ontology
root-cause categories.

| # | id | Service | Chaos | Root cause | Severity | Product surface | Remediation |
|---|----|---------|-------|-----------|----------|-----------------|-------------|
| 1 | `worker-oom` | worker | memleak | memleak | sev2 | Batch / jobs console | restart / scale |
| 2 | `db-saturation` | db_proxy | slow_query | slow_query | sev1 | Data / query studio | scale / config_change |
| 3 | `auth-5xx` | auth | error_5xx | auth_failure | sev1 | Sign-in / account screen | restart / failover |
| 4 | `api-brownout` | api | latency | cpu_saturation | sev2 | Main app dashboard | scale |
| 5 | `db-timeout` | db_proxy | latency | network_partition | sev2 | Connections / pipeline page | failover |
| 6 | `api-config-drift` | api | config_drift (NEW) | config_drift | sev1 | Deploys / releases page | rollback |

**Notes**
- **Only `api`, `worker`, `db_proxy`, `auth` are chaos-able.** The mock-cluster
  "gateway" is the observability control plane (chaos router + logs/metrics/
  traces rollup), not a service that receives chaos. So scenarios target only
  those 4 services; the 6 scenarios spread across them, two services carrying
  two scenarios each.
- Scenarios 1-2 **keep their existing ids** (`worker-oom`, `db-saturation`) so
  the 2 already-archived runs (`worker-oom-mpn4vpfx`, `db-saturation-mpn18cj9`)
  retain their `scenarioTitle`.
- **db_proxy carries scenarios 2 + 5; api carries scenarios 4 + 6.** Safe: chaos
  state is keyed by type (`s.chaos[spec.type]`), so e.g. `slow_query` and
  `latency` on db_proxy never collide, and `latency` vs `config_drift` on api
  never collide. Distinct evidence keeps root causes distinguishable.
  **Caveat:** do not run two scenarios that share a service concurrently in a
  demo (symptoms would mix). Not guarded in code; a demo-operation note only.
- `crash` chaos is intentionally **excluded** (it `os._exit(1)`s the mock
  process, which will not recover mid-demo).

## New chaos primitive: `config_drift`

`config_drift` does not exist yet. Add it minimally:

- `services/mock-cluster/src/argus_cluster/common/chaos.py`: in `apply()`, add a
  branch: if `config_drift` active, return 503 on a fraction of requests
  (`rate`, default ~0.4) with detail `"chaos: config drift"`.
- On inject, emit a distinctive log line, e.g.
  `"config revision N applied: routing=invalid"`, so the agent reading the
  affected service's (api) logs can correlate the error spike with a config
  change and conclude root cause = config_drift, remediation = rollback. Emit it
  from `chaos.inject()` in `common/chaos.py` (lazy-import `logs`) when
  `spec.type == "config_drift"`, so it lands in the service's own ring buffer
  alongside the existing `"chaos injected"` line.

## Architecture

### Routing / surfaces

- **`/status`** (NEW) — ops status board, the demo entry point. Lists the 6
  scenarios as alert cards, tagged by service + severity. Each card has:
  - **(a) direct "investigate"** button → fires the run immediately.
  - **(b) "open dashboard"** → that scenario's bespoke product surface.
- **`/status/[scenario]`** (NEW) — the bespoke product surface for one scenario:
  brand chrome + in-context distress + a trigger ("investigate" / "page Argus")
  that fires the run.
- **`/incidents`** — unchanged in purpose (browse past + historical runs). Its
  old "demoable scenarios" section is removed (superseded by `/status`).
- **`/incident/[id]`** — unchanged (live + archived views).

### Data flow

1. Board + surfaces read scenario metadata from backend `GET /scenarios`
   (curated alert data, **not** live polling — reliable for demo).
2. Trigger (board card or surface button) calls existing
   `POST /scenarios/:id/start` → `{ id }` → `router.push('/incident/' + id)`.
   **No new backend trigger path.**
3. `DemoScenario` gains display fields for the surfaces (symptom metric values,
   a sample log line, accent token / surface key, product label).

### Components (web)

- `apps/web/app/status/page.tsx` + client — ops board.
- `apps/web/app/status/[scenario]/page.tsx` + client — bespoke surface router.
- Shared brand chrome component (logo, nav, palette) used by all 6 surfaces.
- 6 bespoke surface components (one per scenario), built via the `impeccable`
  skill with a single shared brand identity.
- Board alert card, sparkline / metric-tile primitives as needed.

### Backend / cluster

- `apps/orchestrator/src/server.ts`: replace the 2-entry `DEMO_SCENARIOS` with
  the 6 above; extend `DemoScenario` interface with display fields; extend
  `SEVERITY_BY_SCENARIO`.
- `services/mock-cluster/src/argus_cluster/common/chaos.py`: add the
  `config_drift` primitive (apply-branch 503 + inject-time config-revision log).
- `scripts/seed-kb.ts`: realign historical seeds so prior-case lookups hit the
  new root causes (each new scenario should have ≥1 historical precedent in the
  KB to make the "prior cases consulted" feature land).

### Brand identity

Fictional monitored-company name, logo, palette, and type are decided in the
`impeccable shape` step at build time, not pre-specified here. Constraint: one
consistent brand across all 6 surfaces; visually distinct from the Argus brand
(Argus is the observer, the company is the observed).

## Out of scope

- Live metric polling on the board/surfaces (curated data only).
- Guarding against concurrent same-service scenarios.
- The `crash` chaos type.
- `config_drift` as a fully modeled config system (it is a chaos flag + log
  line, nothing more).

## Success criteria

1. `GET /scenarios` returns 6 scenarios; old `worker-oom`/`db-saturation` ids
   preserved.
2. `/status` lists 6 alert cards, each with working direct-investigate +
   open-dashboard actions.
3. Each `/status/[scenario]` renders a branded distress surface with a working
   trigger that starts the correct scenario and routes to its live incident.
4. `config_drift` scenario produces 503s + a config-revision log line; a live
   run reaches root cause = config_drift, remediation = rollback.
5. All 6 surfaces share one cohesive brand, distinct from Argus.
6. Each scenario has ≥1 matching historical precedent seeded in the KB.
