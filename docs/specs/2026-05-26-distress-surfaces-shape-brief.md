# Distress Surfaces — Impeccable Shape Brief (Task 5)

**Status:** approved 2026-05-26 (user confirmed in chat)
**Scope:** 6 bespoke distress surfaces under the Ridgeline brand chrome, served at `/status/[scenario]`.
**Plan ref:** `docs/plans/2026-05-26-demo-scenarios-and-ops-board.md` → Task 5
**Brand ref:** `apps/web/components/distress/brand.tsx` (Task 4, committed in `0e72b0a`)
**Register:** product

## Goal

6 surfaces, one shared brand chrome, **no two surfaces look alike**, each shape matches its product's real-world idiom. Built on shadcn primitives re-themed via `className` with `var(--brand-*)` tokens. All in-surface buttons use `BrandButton` (sharp, mono uppercase) — shadcn `Button` is not used inside these surfaces.

## Shared anatomy

Every surface mounts inside `<BrandChrome surfaceLabel={scenario.productLabel}>` and follows the same vertical scaffold:

1. **Page header**
   - Breadcrumb in Geist Mono dim (e.g. `RIDGELINE / BATCH JOBS / CONSOLE`)
   - H1 in DM Sans 600, 28–32px, tracking `-0.02em`
   - Sub-line = `scenario.symptom` in `--brand-fg-muted`
2. **Action row**
   - `<DistressTrigger>` — `BrandButton` variant `primary`, label `Page Argus`, in phosphor green
   - + 1 secondary `BrandButton` ghost (label varies per surface: `View runbook`, `View slow query`, `Retry`, `Reload tiles`, `Open pipeline`, `Roll back`)
3. **Body** — the per-surface layout (table / form / dashboard / timeline / etc., see matrix below)
4. **Bottom log strip** — mono `sampleLog` echo, present only where logs make sense (batch, query, connections, deploys). Omitted for sign-in and app-dashboard.

## Per-surface layouts (no two alike)

| Surface | Scenario | Layout family | Key shadcn primitives | Secondary action |
|---|---|---|---|---|
| **batch-console** | worker-oom | Wide table of recent worker runs (id · status badge · heap Progress bar · queue depth · started timestamp). Heap bar maxed/red on worker-3. Below: dense mono log strip echoing `sampleLog` for 3 workers. | Table, Progress, Badge | View runbook |
| **query-studio** | db-saturation | Two-pane editor: top = mono SQL block (read-only, showing the slow query verbatim), bottom = Tabs(`Results`, `Profile`, `History`) — Profile tab active, mono metric blocks for latency p50/p95/p99 with `metric.value` highlighted in `--brand-danger`. No table, no dashboard. | Tabs, Separator | View slow query |
| **sign-in** | auth-5xx | Centered narrow form (max-w 380), Ridgeline wordmark above form, email + password inputs (styled disabled-looking), full-width primary "Sign in" button in `--brand-danger` (failed state), red banner above form quoting `sampleLog` and tagged with a `5xx` Badge. No table, no dashboard. | Badge | Retry |
| **app-dashboard** | api-brownout | Mixed-tile dashboard. One large "Pipeline volume" placeholder block (no card chrome, just bordered region), a vertical KPI strip on the right (4 small metric blocks of *varying* widths), 3 narrow ribbon Skeletons across the bottom showing loading-stuck tiles. Deliberately asymmetric. | Skeleton, Progress | Reload tiles |
| **connections** | db-timeout | Full-width Table of upstream connections: glyph · host · port · p95 latency · status Badge. Most rows OK, 2–3 rows red `TIMEOUT`. Above the table: 3 mono summary chips (total · degraded · timing-out). No card grid. | Table, Badge | Open pipeline |
| **deploys** | api-config-drift | Vertical timeline of recent deploys (revisions list, last one highlighted as the drifted revision in `--brand-danger-soft`), each row shows revision · author · age · status Badge · diff snippet. Right rail: thin spark-row stub showing error rate climbing post-deploy. Like Vercel's deploys page. | Badge, Separator | Roll back |

## Trigger contract

`DistressTrigger` is a `"use client"` component in `apps/web/components/distress/trigger.tsx`:

```tsx
"use client";
export function DistressTrigger({ scenario }: { scenario: string }) {
  // - BrandButton variant="primary", label "Page Argus" (idle) / "Paging…" (pending)
  // - onClick: startScenario(scenario) → router.push(`/incident/${id}`)
  // - On error: inline mono error line below button in --brand-danger
}
```

Same component used by every surface — keeps trigger behaviour identical across the demo.

## Severity / status badge tokens

Shadcn Badge re-themed via `className`:

| Severity | bg | fg | border |
|---|---|---|---|
| sev1 | `--brand-danger-soft` (synth: `color-mix(in oklch, var(--brand-danger) 25%, var(--brand-bg))`) | `--brand-danger` (saturated) | `--brand-danger` 1px |
| sev2 | `--brand-surface-2` | `--brand-fg` | `--brand-border-strong` 1px |
| sev3 | transparent | `--brand-fg-muted` | `--brand-border` 1px |

Status badges (per row, in tables/timelines):
- `OK` → sev3-style, fg `--brand-success`
- `DEGRADED` → sev2-style, fg `--brand-warn` (oklch(0.74 0.14 80))
- `TIMEOUT` / `5xx` / `DRIFTED` → sev1-style

## Typography inside surfaces

- **Page H1**: DM Sans 600, 28–32px, `-0.02em`
- **Section labels**: Geist Mono 10.5px uppercase, tracking 0.16–0.22em, `--brand-fg-dim`
- **Body**: DM Sans 400/500, 14px, `--brand-fg-muted`
- **Mono metrics + log strips**: Geist Mono 12px, `--brand-fg`
- **Inline numbers in metrics**: DM Sans 600, larger (e.g. 24–32px) with `tnum`

## Files

- `apps/web/components/distress/trigger.tsx` — `<DistressTrigger scenario>`, client component
- `apps/web/components/distress/surfaces.tsx` — 6 surface components + `<DistressSurface>` resolver (server components, no `"use client"`)
- `apps/web/app/status/[scenario]/page.tsx` — server route: `getScenario(id)` → render `<DistressSurface scenario>`; show not-found state if unknown

Scratch route `apps/web/app/brand-check/page.tsx` (from Task 4) **removed** as part of this task's commit.

## Banned-pattern audit

- ✓ No identical card grids — every surface uses a different layout family.
- ✓ No hero-metric template — surfaces never lead with a giant number above small stats. Metrics are embedded in their natural product context (query Profile tab, table cells, KPI strip).
- ✓ No modals — the trigger routes directly to `/incident/[id]`.
- ✓ No gradient text — accents are single solid `--brand-accent`.
- ✓ No side-stripe borders — full hairlines only.
- ✓ No glassmorphism — surfaces are flat warm-black with hairline structure.
- ✓ Color strategy stays Restrained — green accent ≤10% of pixels per surface (trigger button + 1–2 highlighted metrics).

## Verification

After implementation:
1. `npx tsc --noEmit` in `apps/web` clean.
2. For each scenario id (`worker-oom`, `db-saturation`, `auth-5xx`, `api-brownout`, `db-timeout`, `api-config-drift`), visit `/status/<id>`:
   - BrandChrome present
   - Page header uses scenario `productLabel` + `symptom`
   - `sampleLog` echoed where the layout calls for it
   - Per-surface layout matches the matrix above (visibly distinct from the others)
   - DistressTrigger present and not loading-stuck
3. On one surface, click `Page Argus` → confirm it routes to `/incident/<newid>` and the live investigation view starts.
