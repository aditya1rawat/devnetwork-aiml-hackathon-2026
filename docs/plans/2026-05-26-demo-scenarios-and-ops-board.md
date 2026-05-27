# Demo Scenarios + Ops Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. UI tasks (5, 6) additionally REQUIRE the `impeccable` skill for visual craft.

**Goal:** Replace the 2 bare demo presets + "Launch Investigation" button with 6 chaos scenarios surfaced through an ops status board (`/status`) and 6 bespoke product distress surfaces (one fictional brand) that each trigger an Argus investigation in-context.

**Architecture:** Backend grows from 2 to 6 `DEMO_SCENARIOS` (existing `POST /scenarios/:id/start` path unchanged) plus a new `config_drift` chaos primitive in the mock cluster. The web app gains a `/status` board (alert cards) and `/status/[scenario]` bespoke surfaces, all sharing one fictional-company brand built via the `impeccable` skill. Data is curated (read from `GET /scenarios`), not live-polled.

**Tech Stack:** TypeScript (orchestrator: Hono; web: Next.js 16 / React 19 / Tailwind v4), Python (mock-cluster: FastAPI + pytest), tsx (seed script). UI built on **shadcn/ui** primitives (already have `clsx` + `tailwind-merge` + `lucide-react`), styled via the `impeccable` skill. Spec: `docs/specs/2026-05-26-demo-scenarios-and-ops-board-design.md`.

**shadcn/ui:** This repo uses Tailwind v4 + React 19 — fetch current shadcn docs via the **context7 MCP** (`resolve-library-id` → `query-docs` for "shadcn/ui") before running the CLI or writing component code, since v4/React-19 setup differs from older guides. Build the new surfaces on shadcn primitives (Button, Badge, Card sparingly, Table, Tabs, Tooltip, Progress, Skeleton, Separator) rather than hand-rolled markup. **Impeccable tension:** impeccable bans lazy identical card grids and "card as first thought" — use shadcn primitives as building blocks and apply impeccable craft over them; don't let the board collapse into a uniform card grid.

**Reference reading before starting:**
- Spec: `docs/specs/2026-05-26-demo-scenarios-and-ops-board-design.md`
- `apps/orchestrator/src/server.ts:25-60` (DemoScenario + DEMO_SCENARIOS), `:110-113` (SEVERITY_BY_SCENARIO), `:255-279` (/scenarios + start)
- `services/mock-cluster/src/argus_cluster/common/chaos.py` (full)
- `services/mock-cluster/tests/test_chaos.py` (test patterns)
- `apps/web/lib/api.ts:28-63` (DemoScenario + scenario fns)
- `apps/web/app/incidents/client.tsx` (existing scenario card UI to remove)
- `apps/web/AGENTS.md` — Next.js here has breaking changes; read `node_modules/next/dist/docs/` before web code.

**Conventions:**
- Run mock-cluster tests with `uv` from `services/mock-cluster`: `uv run pytest`.
- Orchestrator runs under `node --watch`; a source edit auto-restarts it. Web runs under Turbopack HMR.
- Caveman tone in chat; normal prose in code/commits.

---

### Task 1: `config_drift` chaos primitive (mock-cluster)

**Files:**
- Modify: `services/mock-cluster/src/argus_cluster/common/chaos.py`
- Test: `services/mock-cluster/tests/test_chaos.py`

- [ ] **Step 1: Write the failing tests**

Append to `services/mock-cluster/tests/test_chaos.py`:

```python
def test_config_drift_inject_emits_revision_log():
    from argus_cluster.common import logs
    before = len(logs.snapshot())
    chaos.inject(chaos.ChaosSpec(type="config_drift", target="api", duration_s=10, params={"revision": 47}))
    snap = logs.snapshot()
    assert len(snap) > before
    assert any("config revision 47" in r["msg"] for r in snap[-3:])
    chaos.clear()


def test_config_drift_active_after_inject():
    chaos.inject(chaos.ChaosSpec(type="config_drift", target="api", duration_s=10, params={"rate": 1.0}))
    assert chaos._active("config_drift") is not None
    chaos.clear()
    assert chaos._active("config_drift") is None


async def test_config_drift_apply_raises_503_when_rate_one():
    import pytest
    from fastapi import HTTPException
    chaos.inject(chaos.ChaosSpec(type="config_drift", target="api", duration_s=10, params={"rate": 1.0}))
    with pytest.raises(HTTPException) as ei:
        await chaos.apply("/process/x")
    assert ei.value.status_code == 503
    assert "config drift" in ei.value.detail
    chaos.clear()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd services/mock-cluster && uv run pytest tests/test_chaos.py -v -k config_drift`
Expected: FAIL — `config_drift` produces no log line and `apply()` does not raise (no branch yet). The async test may need `pytest.mark.asyncio`; if the suite lacks async support, see Step 3 note.

- [ ] **Step 3: Implement the primitive**

In `services/mock-cluster/src/argus_cluster/common/chaos.py`:

Update the `ChaosSpec` type comment (line ~12) to include the new type:

```python
    type: str        # latency | error_5xx | memleak | crash | slow_query | config_drift
```

Add a config-revision log emit inside `inject()` (after the existing `s.chaos[...] = {...}` assignment):

```python
def inject(spec: ChaosSpec) -> None:
    s = state.get()
    s.chaos[spec.type] = {
        "expires_at": time.time() + spec.duration_s,
        **spec.params,
    }
    if spec.type == "config_drift":
        from . import logs
        rev = spec.params.get("revision", 1)
        logs.emit(
            "warn",
            f"config revision {rev} applied: routing=invalid pool_size=0",
            revision=rev,
            target=spec.target,
        )
```

Add a `config_drift` branch in `apply()` (after the `error_5xx` branch, before `crash`):

```python
    if (drift := _active("config_drift")) is not None:
        rate = drift.get("rate", 0.4)
        if random.random() < rate:
            raise HTTPException(status_code=503, detail="chaos: config drift (invalid routing)")
```

Note on async test: if `uv run pytest tests/test_chaos.py -k config_drift` reports the async test as skipped/errored because no asyncio plugin is configured, mark it explicitly. Check `services/mock-cluster/pyproject.toml` for `pytest-asyncio`; if present, add `import pytest` and `@pytest.mark.asyncio` above `test_config_drift_apply_raises_503_when_rate_one`. If absent, convert that one test to drive `apply()` via `asyncio.run(...)`:

```python
def test_config_drift_apply_raises_503_when_rate_one():
    import asyncio, pytest
    from fastapi import HTTPException
    chaos.inject(chaos.ChaosSpec(type="config_drift", target="api", duration_s=10, params={"rate": 1.0}))
    with pytest.raises(HTTPException) as ei:
        asyncio.run(chaos.apply("/process/x"))
    assert ei.value.status_code == 503
    assert "config drift" in ei.value.detail
    chaos.clear()
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd services/mock-cluster && uv run pytest tests/test_chaos.py -v -k config_drift`
Expected: 3 passed.

- [ ] **Step 5: Run the full chaos suite (no regressions)**

Run: `cd services/mock-cluster && uv run pytest tests/test_chaos.py -v`
Expected: all pass (existing latency/inject tests + 3 new).

- [ ] **Step 6: Commit**

```bash
git add services/mock-cluster/src/argus_cluster/common/chaos.py services/mock-cluster/tests/test_chaos.py
git commit -m "cluster: add config_drift chaos primitive (503 + revision log)"
```

---

### Task 2: 6-scenario backend set (orchestrator)

**Files:**
- Modify: `apps/orchestrator/src/server.ts:25-60` (interface + DEMO_SCENARIOS), `:110-113` (SEVERITY_BY_SCENARIO)

- [ ] **Step 1: Extend the `DemoScenario` interface with display fields**

Replace the interface at `apps/orchestrator/src/server.ts:25-35` with:

```typescript
interface DemoScenario {
  id: string;
  title: string;
  blurb: string;
  rootCause: string;
  chaosType: string;
  target: string;
  params: Record<string, number>;
  durationS: number;
  warmupS: number;
  // Display metadata for the ops board + distress surfaces.
  service: string;            // chaos-able service: api | worker | db_proxy | auth
  severity: "sev1" | "sev2" | "sev3";
  surfaceKey: string;         // which bespoke surface renders this (see web Task 5)
  productLabel: string;       // product-surface name shown to the operator
  symptom: string;            // one-line headline symptom for the alert card
  metric: { label: string; value: string; trend: "up" | "down" };
  sampleLog: string;          // representative log line shown on the surface
}
```

- [ ] **Step 2: Replace `DEMO_SCENARIOS` with the 6-scenario set**

Replace `apps/orchestrator/src/server.ts:37-60` with:

```typescript
const DEMO_SCENARIOS: Record<string, DemoScenario> = {
  "worker-oom": {
    id: "worker-oom",
    title: "Worker OOM",
    blurb: "Worker process leaking 120MB/tick — heap exhaustion backing up the job queue.",
    rootCause: "memleak on worker",
    chaosType: "memleak",
    target: "worker",
    params: { mb_per_tick: 120 },
    durationS: 120,
    warmupS: 10,
    service: "worker",
    severity: "sev2",
    surfaceKey: "batch-console",
    productLabel: "Batch Jobs",
    symptom: "Worker heap climbing, job queue backing up",
    metric: { label: "heap_used", value: "92%", trend: "up" },
    sampleLog: "worker-3 heap_used=3.8GB queue_depth=11820",
  },
  "db-saturation": {
    id: "db-saturation",
    title: "DB Proxy Saturation",
    blurb: "db_proxy responding at 1.5s/query — every downstream API call hangs.",
    rootCause: "slow_query on db_proxy",
    chaosType: "slow_query",
    target: "db_proxy",
    params: { ms: 1500 },
    durationS: 120,
    warmupS: 3,
    service: "db_proxy",
    severity: "sev1",
    surfaceKey: "query-studio",
    productLabel: "Query Studio",
    symptom: "Query p99 at 1.5s, connection pool saturating",
    metric: { label: "pool_wait_p99", value: "1.5s", trend: "up" },
    sampleLog: "db pool exhausted inflight=16",
  },
  "auth-5xx": {
    id: "auth-5xx",
    title: "Auth 5xx Storm",
    blurb: "auth service throwing 503s on ~50% of verify calls — users bounced at sign-in.",
    rootCause: "error_5xx on auth",
    chaosType: "error_5xx",
    target: "auth",
    params: { rate: 0.5 },
    durationS: 120,
    warmupS: 3,
    service: "auth",
    severity: "sev1",
    surfaceKey: "sign-in",
    productLabel: "Sign In",
    symptom: "Logins failing, 503 rate climbing on auth",
    metric: { label: "auth_503_rate", value: "48%", trend: "up" },
    sampleLog: "chaos: 5xx injected path=/verify",
  },
  "api-brownout": {
    id: "api-brownout",
    title: "API Brownout",
    blurb: "api latency spiking under load — requests piling inflight, pages timing out.",
    rootCause: "cpu_saturation on api",
    chaosType: "latency",
    target: "api",
    params: { mean_ms: 1200 },
    durationS: 120,
    warmupS: 3,
    service: "api",
    severity: "sev2",
    surfaceKey: "app-dashboard",
    productLabel: "Dashboard",
    symptom: "App slow, requests piling inflight",
    metric: { label: "req_p99", value: "1.2s", trend: "up" },
    sampleLog: "api inflight=42 latency_p99=1180ms",
  },
  "db-timeout": {
    id: "db-timeout",
    title: "Upstream Timeouts",
    blurb: "db_proxy stalling 2.5s/call — api requests timing out, partition-like symptoms.",
    rootCause: "network_partition between api and db_proxy",
    chaosType: "latency",
    target: "db_proxy",
    params: { mean_ms: 2500 },
    durationS: 120,
    warmupS: 3,
    service: "db_proxy",
    severity: "sev2",
    surfaceKey: "connections",
    productLabel: "Connections",
    symptom: "Upstream db calls timing out from api",
    metric: { label: "db_timeout_rate", value: "31%", trend: "up" },
    sampleLog: "worker failed err=ReadTimeout job=...",
  },
  "api-config-drift": {
    id: "api-config-drift",
    title: "Bad Config Deploy",
    blurb: "a config revision flipped api routing to invalid — error spike right after deploy.",
    rootCause: "config_drift on api",
    chaosType: "config_drift",
    target: "api",
    params: { rate: 0.45, revision: 47 },
    durationS: 120,
    warmupS: 3,
    service: "api",
    severity: "sev1",
    surfaceKey: "deploys",
    productLabel: "Deploys",
    symptom: "Error spike immediately after config revision 47",
    metric: { label: "error_rate", value: "44%", trend: "up" },
    sampleLog: "config revision 47 applied: routing=invalid pool_size=0",
  },
};
```

- [ ] **Step 3: Update `SEVERITY_BY_SCENARIO`**

Replace `apps/orchestrator/src/server.ts:110-113` with:

```typescript
  const SEVERITY_BY_SCENARIO: Record<string, "sev1" | "sev2" | "sev3"> = {
    "worker-oom": "sev2",
    "db-saturation": "sev1",
    "auth-5xx": "sev1",
    "api-brownout": "sev2",
    "db-timeout": "sev2",
    "api-config-drift": "sev1",
  };
```

- [ ] **Step 4: Verify the orchestrator serves 6 scenarios**

The orchestrator auto-restarts under `node --watch`. Then:

Run: `curl -s http://localhost:7200/scenarios | npx --yes json 'scenarios' | grep -c '"id"'`
(or `curl -s http://localhost:7200/scenarios` and eyeball)
Expected: 6 scenarios; ids include `worker-oom`, `db-saturation`, `auth-5xx`, `api-brownout`, `db-timeout`, `api-config-drift`; each has `service`, `surfaceKey`, `metric`, `sampleLog`.

- [ ] **Step 5: Type-check the orchestrator**

Run: `cd apps/orchestrator && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/orchestrator/src/server.ts
git commit -m "orchestrator: 6-scenario demo set with ops-board display metadata"
```

---

### Task 3: Web scenario type parity (lib/api.ts)

**Files:**
- Modify: `apps/web/lib/api.ts:28-38` (DemoScenario interface)

- [ ] **Step 1: Extend the web `DemoScenario` to match the backend**

Replace `apps/web/lib/api.ts:28-38` with:

```typescript
export interface DemoScenario {
  id: string;
  title: string;
  blurb: string;
  rootCause: string;
  chaosType: string;
  target: string;
  params: Record<string, number>;
  durationS: number;
  warmupS: number;
  service: string;
  severity: "sev1" | "sev2" | "sev3";
  surfaceKey: string;
  productLabel: string;
  symptom: string;
  metric: { label: string; value: string; trend: "up" | "down" };
  sampleLog: string;
}
```

- [ ] **Step 2: Add a single-scenario fetch helper**

After `listScenarios()` (ends `apps/web/lib/api.ts:57`), add:

```typescript
export async function getScenario(id: string): Promise<DemoScenario | null> {
  const all = await listScenarios();
  return all.find((s) => s.id === id) ?? null;
}
```

- [ ] **Step 3: Type-check the web app**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors. (The existing `/incidents` ScenarioCard reads only `title/chaosType/blurb/target/warmupS/durationS`, all still present.)

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/api.ts
git commit -m "web: extend DemoScenario type with display fields + getScenario"
```

---

### Task 3.5: shadcn/ui setup (Tailwind v4 / React 19)

**Files:**
- Create: `apps/web/components.json`, `apps/web/components/ui/*` (generated primitives)
- Modify: `apps/web/app/globals.css` (shadcn token layer — **append, do not clobber** the existing Argus `--color-*` OKLCH tokens), `apps/web/tsconfig.json` (only if the `@/*` alias is missing)

- [ ] **Step 1: Fetch current shadcn docs via context7**

Use the context7 MCP: `resolve-library-id` for "shadcn/ui", then `query-docs` for "Next.js Tailwind v4 React 19 installation and init". Confirm the correct init command + Tailwind-v4 specifics (CSS `@theme`, no `tailwind.config.js`) before touching the project.

- [ ] **Step 2: Init shadcn non-destructively**

Verify `apps/web/tsconfig.json` has a `@/*` path alias (the codebase already imports `@/lib/api`, so it does). From `apps/web`, run the init command from the context7 docs (current form: `npx shadcn@latest init`). Choose settings that:
- write `components.json` with aliases `@/components`, `@/components/ui`, `@/lib/utils`;
- **do not overwrite** the existing OKLCH design tokens in `globals.css` — if init wants to rewrite the theme, accept only the additive shadcn variable layer or merge manually so the current Argus tokens survive.

After init, confirm `apps/web/lib/utils.ts` exists with the `cn()` helper (shadcn standard). If init created a duplicate Tailwind config, reconcile to the existing v4 setup.

- [ ] **Step 3: Add the primitives the UI tasks need**

Run (per context7 docs, current form): `npx shadcn@latest add button badge card table tabs tooltip progress skeleton separator`
Expected: files land in `apps/web/components/ui/`.

- [ ] **Step 4: Verify build is intact (tokens preserved)**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors.
Then load an existing page (e.g. `/incidents`) in the browser and confirm the existing Argus styling is unchanged (tokens not clobbered) and no console errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components.json apps/web/components/ui apps/web/lib/utils.ts apps/web/app/globals.css
git commit -m "web: shadcn/ui setup (Tailwind v4 / React 19) preserving Argus tokens"
```

---

### Task 4: Brand identity (impeccable shape)

**Files:**
- Create: `apps/web/components/distress/brand.tsx` (brand chrome: logo wordmark, top nav shell, palette tokens)
- Reference: `PRODUCT.md` / `DESIGN.md` via impeccable context loader

This task produces the single fictional-company brand all 6 surfaces share. **Argus is the observer brand; this is the observed company — it must look visually distinct from the existing Argus UI** (different wordmark, accent hue, and chrome).

- [ ] **Step 1: Run the impeccable context + shape gate**

Invoke the `impeccable` skill. Run its context loader, confirm register = **product** (this is app UI, not marketing). Then run `impeccable shape` for the brand: produce a shape brief covering the fictional company name, wordmark treatment, one accent hue (OKLCH, distinct from Argus), neutral tint, type pairing, and the shared top-nav chrome. **Get explicit user confirmation of the brief before writing code** (impeccable craft gate).

- [ ] **Step 2: Build the shared brand chrome component**

Create `apps/web/components/distress/brand.tsx` exporting:
- `BrandChrome({ children, surfaceLabel }: { children: React.ReactNode; surfaceLabel: string })` — renders the company top-nav (wordmark + a few static nav items + the current `surfaceLabel`) wrapping `children`.
- Brand color tokens as CSS variables scoped to the chrome wrapper (do not reuse Argus `--color-*` tokens; namespace as e.g. `--brand-*`).

Exact JSX/styling is the impeccable craft deliverable; it must satisfy the shared design laws (OKLCH color, no banned patterns, ease-out motion only).

- [ ] **Step 3: Verify it renders in isolation**

Temporarily mount `BrandChrome` on a scratch route or via the `/status` board build in Task 5; confirm no console errors and the wordmark/accent read as a distinct brand.

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/distress/brand.tsx PRODUCT.md DESIGN.md
git commit -m "web: fictional-company brand chrome for distress surfaces"
```
(Only add `PRODUCT.md`/`DESIGN.md` if impeccable created/updated them.)

---

### Task 5: Bespoke distress surfaces (`/status/[scenario]`, impeccable)

**Files:**
- Create: `apps/web/app/status/[scenario]/page.tsx` (server component — reads scenario, renders surface)
- Create: `apps/web/components/distress/surfaces.tsx` (the 6 bespoke surface components, keyed by `surfaceKey`)
- Create: `apps/web/components/distress/trigger.tsx` (shared "investigate / page Argus" trigger button)

**Surface contract:** each surface is a React component receiving `{ scenario: DemoScenario }` and rendering inside `BrandChrome`. It shows the product surface in distress using `scenario.productLabel`, `scenario.symptom`, `scenario.metric`, `scenario.sampleLog`, and includes `<DistressTrigger scenario={scenario} />`. `surfaceKey` → component map:

| surfaceKey | scenario | surface |
|------------|----------|---------|
| `batch-console` | worker-oom | Batch jobs console (queue depth, worker heap) |
| `query-studio` | db-saturation | Query studio (running query, latency) |
| `sign-in` | auth-5xx | Sign-in screen (failed login state) |
| `app-dashboard` | api-brownout | Main app dashboard (slow/spinner tiles) |
| `connections` | db-timeout | Connections / pipeline page (timeouts) |
| `deploys` | api-config-drift | Deploys page (recent revision flip + error spike) |

- [ ] **Step 1: Build the shared trigger**

Create `apps/web/components/distress/trigger.tsx`:

```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { startScenario } from "@/lib/api";

export function DistressTrigger({ scenario, label = "Investigate with Argus" }: { scenario: string; label?: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function go() {
    setPending(true);
    setErr(null);
    try {
      const { id } = await startScenario(scenario);
      router.push(`/incident/${id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setPending(false);
    }
  }
  return (
    <div className="flex flex-col gap-1">
      <button type="button" onClick={go} disabled={pending} aria-label={label}>
        {pending ? "starting…" : label}
      </button>
      {err ? <span role="alert">{err}</span> : null}
    </div>
  );
}
```
(Class names / visual styling are the impeccable craft deliverable; the prop `scenario` is the scenario **id** string.)

- [ ] **Step 2: Shape the surfaces with impeccable**

Continue the `impeccable` skill from Task 4 (register=product). Run `impeccable craft` for the 6 surfaces as a set: confirm a shape brief that keeps all 6 within the one brand while giving each a distinct, believable product layout. Build on the shadcn primitives from Task 3.5 (Table for batch/connections, Tabs/Progress for dashboards, Badge for status, Button for actions, Skeleton for loading-ish tiles); query context7 for any primitive's current API as needed. Get user confirmation of the brief before writing JSX.

- [ ] **Step 3: Build `surfaces.tsx` with the 6 components + a resolver**

Create `apps/web/components/distress/surfaces.tsx` exporting one component per `surfaceKey` and a resolver:

```tsx
import type { DemoScenario } from "@/lib/api";
// ...6 surface components, each: function BatchConsole({ scenario }: { scenario: DemoScenario }) { ... }

export function DistressSurface({ scenario }: { scenario: DemoScenario }) {
  switch (scenario.surfaceKey) {
    case "batch-console": return <BatchConsole scenario={scenario} />;
    case "query-studio": return <QueryStudio scenario={scenario} />;
    case "sign-in": return <SignIn scenario={scenario} />;
    case "app-dashboard": return <AppDashboard scenario={scenario} />;
    case "connections": return <Connections scenario={scenario} />;
    case "deploys": return <Deploys scenario={scenario} />;
    default: return <AppDashboard scenario={scenario} />;
  }
}
```
Each component renders inside `BrandChrome` and embeds `<DistressTrigger scenario={scenario.id} />`. Visual detail = impeccable deliverable.

- [ ] **Step 4: Build the route**

Create `apps/web/app/status/[scenario]/page.tsx`. Read the Next.js docs for the params API first (`apps/web/AGENTS.md`). It must resolve the `scenario` param, fetch via `getScenario(id)`, render `<DistressSurface scenario={...} />`, and render a not-found state if the scenario is unknown.

- [ ] **Step 5: Verify each surface renders + trigger works (Playwright)**

Start dev servers if not running. For each scenario id, navigate to `/status/<id>`, screenshot, confirm: brand chrome present, distress content uses the scenario's metric/symptom/sampleLog, trigger button present, no console errors. Then on one surface, click the trigger and confirm it routes to `/incident/<newid>` and the live view starts.

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/status/[scenario] apps/web/components/distress/surfaces.tsx apps/web/components/distress/trigger.tsx
git commit -m "web: 6 bespoke distress surfaces with in-context Argus trigger"
```

---

### Task 6: Ops status board (`/status`, impeccable)

**Files:**
- Create: `apps/web/app/status/page.tsx` (+ a client component for interactivity)
- Modify: `apps/web/app/incidents/client.tsx` (remove the old "demoable scenarios" section + its launch handler)
- Modify: nav/topbar so the board is reachable (in `apps/web/app/incidents/client.tsx` Topbar and `apps/web/app/page.tsx` if it links scenarios)

- [ ] **Step 1: Shape the board with impeccable**

Continue `impeccable` (register=product). `impeccable craft` for `/status`: a board listing the 6 scenarios as alert cards, each tagged by `service` + `severity`, showing `symptom` + `metric`, with two actions — **direct "investigate"** (calls `startScenario(id)` → push `/incident/[id]`) and **"open dashboard"** (`Link` to `/status/[id]`). Confirm the shape brief with the user before code.

- [ ] **Step 2: Build the board**

Create `apps/web/app/status/page.tsx` + client. The client reads `listScenarios()`, renders the 6 scenarios as alert entries (shadcn Badge for service+severity, Button for the two actions; avoid a uniform card grid per the impeccable tension note). The investigate action reuses the same logic as `DistressTrigger` (factor the start+route into a shared hook or reuse `startScenario` directly). The board is the demo entry point; give it a clear "production status" framing under the fictional brand chrome (`BrandChrome` from Task 4).

- [ ] **Step 3: Remove the old scenario section from `/incidents`**

In `apps/web/app/incidents/client.tsx`:
- Remove the `scenarios` state, the `listScenarios` effect (lines ~9, ~15-17), the `launch` function (lines ~47-57), the `ScenarioCard`/`Meta` components (lines ~153-200), and the "demoable scenarios" `<section>` (lines ~74-86).
- Remove now-unused imports (`listScenarios`, `startScenario`, `DemoScenario`, `useRouter` if no longer used).
- Add a link/button in the Topbar (or the header) pointing to `/status` ("status board" / "trigger a scenario").
- Keep the "argus-resolved past runs" and "historical" sections intact.

- [ ] **Step 4: Verify board + navigation (Playwright + typecheck)**

Navigate to `/status`: confirm 6 cards, each with service+severity tags, investigate + open-dashboard actions. Click "open dashboard" on one → lands on `/status/<id>`. Back on the board, click "investigate" on one → lands on `/incident/<newid>` live view. Navigate to `/incidents`: confirm the old scenario cards are gone, past-runs + historical remain, and the link to `/status` works.

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/status/page.tsx apps/web/app/incidents/client.tsx apps/web/app/page.tsx
git commit -m "web: ops status board hub; drop scenario cards from incidents page"
```

---

### Task 7: Verify KB historical precedents cover the new root causes

**Files:**
- Modify (only if a gap is found): `scripts/seed-kb.ts`

The 12 existing seeds already span memleak, slow_query, auth_failure, network_partition, cpu_saturation, and config_drift. This task confirms that and re-seeds if the KB was reset.

- [ ] **Step 1: Confirm root-cause coverage in the seed file**

Run: `grep -n "incident_id:" scripts/seed-kb.ts`
Expected: 12 seeds including ids for worker-oom, db-saturation, auth, network-partition, config-drift (x2), cpu-saturation, memleak. Confirm each of the 6 new scenario root causes (memleak, slow_query, auth_failure, network_partition, cpu_saturation, config_drift) has ≥1 seed. If any is missing, add a seed following the existing `Seed` shape (Summary/Timeline-table/Root Cause/Remediation, `provenance: "historical"`, `resolved_at: daysAgo(n)`).

- [ ] **Step 2: Confirm the KB has the seeds (or re-seed)**

Run: `curl -s http://localhost:7200/incidents/historical | npx --yes json 'incidents' | grep -c incident_id`
Expected: ≥ 6 historical incidents. If 0 (KB was reset), re-seed:
Run: `cd /Users/adityarawat/Documents/github/devnetwork-hackathon-2026 && npx tsx scripts/seed-kb.ts`
Expected: seeds POST one-by-one to `:7301/admin/ingest` with rate-limit-aware delays; completes without 429s.

- [ ] **Step 3: Commit (only if seeds changed)**

```bash
git add scripts/seed-kb.ts
git commit -m "scripts: ensure historical precedents cover all 6 demo root causes"
```

---

### Task 8: End-to-end demo verification

**Files:** none (verification only)

- [ ] **Step 1: Run one full scenario per surface family via the board**

With all services up (mock-cluster, orchestrator :7200, KB admin :7301, Neo4j, web :3000), for at least 3 scenarios spanning distinct chaos types — pick `worker-oom` (memleak), `auth-5xx` (error_5xx), `api-config-drift` (config_drift) — do: open `/status` → "investigate" → watch the live incident reach a final report. Confirm:
- The investigation reads the relevant service's logs/metrics/traces.
- `api-config-drift` reaches root cause = config_drift / remediation = rollback, and the agent's tool calls surface the `config revision 47 applied` log.
- "Prior Cases Consulted" shows ≥1 historical precedent.

- [ ] **Step 2: Confirm both same-service scenarios work independently**

Run `db-saturation` (slow_query) to completion, then separately `db-timeout` (latency) — confirm each produces its own incident with distinct symptoms (not run concurrently).

- [ ] **Step 3: Confirm the distress-surface trigger path**

From `/status/api-brownout`, click the in-surface trigger → confirm it starts `api-brownout` and routes to the live view.

- [ ] **Step 4: Final full type-check + chaos test sweep**

Run: `cd apps/web && npx tsc --noEmit && cd ../orchestrator && npx tsc --noEmit && cd ../../services/mock-cluster && uv run pytest tests/test_chaos.py -q`
Expected: clean.

- [ ] **Step 5: No commit** — verification only. Report results to the user.

---

## Notes on scope boundaries (from spec)

- No live metric polling — board/surfaces use curated data from `GET /scenarios`.
- No code guard against concurrent same-service scenarios (demo-operation note only).
- `crash` chaos excluded.
- `config_drift` is a chaos flag + log line, not a real config system.
- `docs/demos/` and demo scripts stay untracked (per standing user instruction — do not `git add` them).
