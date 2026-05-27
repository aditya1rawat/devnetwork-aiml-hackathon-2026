# PRODUCT.md

## What this is

**Argus** is a dual-cognition autonomous SRE agent. It watches production for an operator, reasons across two independent LLM "minds" running the same incident in parallel, and routes around its own dependencies when they fail — surviving the infrastructure chaos it is responding to.

The thing the user sees during a demo is two surfaces working in tandem:

1. **An observed-company product UI** that goes into distress (a sign-in screen failing, a batch console heap-climbing, a query studio timing out, etc.). The operator triggers Argus from inside that UI.
2. **The Argus investigation view** — live reasoning panes, divergence detection, provider failover banners, historical case retrieval, an evolving timeline, and a final report.

The two are visually and brand-distinct. Argus is the *observer*. The other surface is the *observed*.

## Users

A single archetype: **the on-call operator at 2am.** They are technical, sleep-deprived, and need to decide in 60 seconds whether the page is real and what to do. Everything in the product must read at-a-glance and recover gracefully when they look away and back.

## Register

- **`register: product`** — both surfaces are app UI, not marketing. Argus is the working tool; the observed-company surface is a believable internal product page in distress.

## Brand: Argus

- **Wordmark:** lowercase `argus`, serif italic for the wordmark, sans for chrome.
- **Palette:** deep cool neutrals (OKLCH `0.16 0.012 270` → `0.96 0.008 270`), one violet primary (`oklch(0.72 0.16 278)`), amber for shadow/provenance (`0.80 0.13 78`), red for danger (`0.66 0.20 22`).
- **Voice:** observational, precise, never alarming. "saw", "noted", "agreed", "diverged" — verbs of an attentive watcher.
- **Anti-references:** Datadog cobalt-and-purple sprawl, PagerDuty alarm-red, generic-SaaS gradient hero. Argus does not shout.

## Brand: the observed company (NEW — built in this task)

A fictional operating company whose product is in distress. It must be:

- **Visually distinct from Argus.** Different wordmark, different accent hue, different chrome treatment. If the two screenshots are placed side by side, no one mistakes them for the same brand.
- **Believable as a real internal product.** Not a parody, not a logo joke. The kind of brand that would credibly run a "batch jobs console" or "query studio" at scale.
- **One brand, six surfaces.** Used identically across `worker-oom`, `db-saturation`, `auth-5xx`, `api-brownout`, `db-timeout`, `api-config-drift`. The brand is the shared chrome; each surface is a different product page inside it.

## Architecture (current)

| Component | Port | Stack |
|-----------|------|-------|
| Argus web (investigation view) | :3000 | Next.js 16, React 19, Tailwind v4 |
| Ridgeline (product simulation) | :3001 | Next.js 16, React 19, CSS-in-JS tokens |
| Orchestrator | :7200 | Hono, Node.js |
| Mock cluster (api/worker/db/auth) | :7100-7104 | FastAPI, Python |
| Incident KB | :7300 (MCP) / :7301 (admin) | FastAPI, Neo4j, Graphiti |
| Neo4j | :7474 / :7687 | Docker |

### Ridgeline surfaces (with embedded Argus triggers)

| Surface | Route | Fault | Trigger time |
|---------|-------|-------|-------------|
| Overview | `/` | — (dashboard, no fault) | — |
| Sign In | `/login` | auth-5xx (503 storm) | ~700ms |
| Query Studio | `/query` | db-saturation (pool exhaust) | ~2.5s |
| Batch Jobs | `/jobs` | worker-oom (heap climb) | ~6s |

### All 6 demo scenarios

worker-oom, db-saturation, auth-5xx, api-brownout, db-timeout, api-config-drift. All triggerable from the Argus ops board. First 3 also have Ridgeline product surfaces.

## Strategic principles

1. **No identical card grids.** Distress is not a Bento board. Each surface gets a layout matched to the product it imitates (a table for batch jobs, a query result pane for studio, a sign-in form for auth, etc.).
2. **No alarm-red dread by default.** Severity is conveyed through composition, density, and a single accent — not through painting everything red.
3. **The "page Argus" trigger is in-context, never modal-first.** It belongs inside the affected UI, not in a popup overlay.
4. **Two brands, never blended.** The Argus accent never appears on the observed-company surface, and vice versa.
