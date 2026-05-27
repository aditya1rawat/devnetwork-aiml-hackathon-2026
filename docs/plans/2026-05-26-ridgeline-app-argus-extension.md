# Ridgeline App + Argus Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone Ridgeline web app (port 3001) where ordinary product actions trigger faults, an embedded bottom-right Argus launcher pops a real LLM triage diagnosis, and a CTA deep-links into the existing Argus incident view (port 3000).

**Architecture:** New `apps/ridgeline` Next app in the pnpm workspace, talking to the existing orchestrator (port 7200) which gains one new `POST /triage` endpoint. Ridgeline owns three hands-on pages (login/query/jobs) plus a global Argus launcher; on "Open investigation" it calls the existing `startScenario` then navigates the browser to `apps/web` at `/incident/[id]`.

**Tech Stack:** Hono + vitest (orchestrator); Next 16.2.6 + React 19.2.4 + Tailwind v4 (Ridgeline, mirroring `apps/web`); pnpm workspace.

**Spec:** `docs/specs/2026-05-26-ridgeline-app-argus-extension-design.md`

**Conventions to respect:**
- pnpm only, never npm.
- `apps/web/AGENTS.md`: this Next version has breaking changes — read `node_modules/next/dist/docs/` before writing Next code.
- Frontend visual work goes through the `$impeccable shape` → user-approved brief → `$impeccable craft` gate. Tasks 4–7 each call this out explicitly. Do NOT write final distress-surface visuals without an approved shape brief.
- The web app (`apps/web`) has no test runner; Ridgeline frontend verification is `tsc --noEmit` + manual browser checks, not unit tests. Only the orchestrator (Task 1) uses TDD.

---

### Task 1: Orchestrator `POST /triage` endpoint

**Files:**
- Modify: `apps/orchestrator/src/server.ts` (add route inside `buildApp`, near the other `app.post(...)` routes around line 355)
- Test: `apps/orchestrator/test/triage.test.ts`

**Contract:** `POST /triage` with body `{ scenario: string }`. Unknown scenario → 404 `{ error: "unknown scenario" }`. Otherwise makes exactly one `deps.gateway.chat(...)` call (fast model, JSON response) and returns `{ diagnosis: string, suspectedRootCause: string }`. On any error or unparseable/incomplete model output, returns a per-scenario fallback derived from the scenario's `symptom`/`sampleLog`/`rootCause`, still HTTP 200.

- [ ] **Step 1: Write the failing test**

Create `apps/orchestrator/test/triage.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { buildApp } from "../src/server.js";

function appWith(chat: (...args: unknown[]) => unknown) {
  const deps = {
    gateway: { chat } as never,
    pool: {} as never,
    registry: {} as never,
    chaosState: { killClaude: false, killNemotron: false, gatewayDown: false },
    kb: null,
  };
  return buildApp(deps).app;
}

function post(app: ReturnType<typeof appWith>, scenario: unknown) {
  return app.request("/triage", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ scenario }),
  });
}

describe("POST /triage", () => {
  it("returns parsed diagnosis from the model", async () => {
    const chat = vi.fn(async () => ({
      text: JSON.stringify({ diagnosis: "Heap climbing on worker-3.", suspectedRootCause: "memory leak" }),
      latencyMs: 5,
      provider: "claude",
      via: "gateway",
    }));
    const res = await post(appWith(chat), "worker-oom");
    expect(res.status).toBe(200);
    const j = (await res.json()) as { diagnosis: string; suspectedRootCause: string };
    expect(j.diagnosis).toContain("Heap climbing");
    expect(j.suspectedRootCause).toBe("memory leak");
    expect(chat).toHaveBeenCalledTimes(1);
  });

  it("404 on unknown scenario", async () => {
    const res = await post(appWith(vi.fn()), "nope");
    expect(res.status).toBe(404);
  });

  it("falls back to scenario data when the model errors", async () => {
    const chat = vi.fn(async () => {
      throw new Error("boom");
    });
    const res = await post(appWith(chat), "auth-5xx");
    expect(res.status).toBe(200);
    const j = (await res.json()) as { suspectedRootCause: string };
    expect(j.suspectedRootCause).toBe("error_5xx on auth");
  });

  it("falls back when the model returns incomplete JSON", async () => {
    const chat = vi.fn(async () => ({
      text: JSON.stringify({ diagnosis: "partial only" }),
      latencyMs: 5,
      provider: "claude",
      via: "gateway",
    }));
    const res = await post(appWith(chat), "db-saturation");
    expect(res.status).toBe(200);
    const j = (await res.json()) as { suspectedRootCause: string };
    expect(j.suspectedRootCause).toBe("slow_query on db_proxy");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @argus/orchestrator exec vitest run test/triage.test.ts`
Expected: FAIL — the `/triage` route does not exist yet, so requests return 404 for `worker-oom` too (first test fails on `diagnosis` assertion / status).

- [ ] **Step 3: Add the triage route**

In `apps/orchestrator/src/server.ts`, inside `buildApp`, add this block immediately after the `app.post("/scenarios/:scenario/start", ...)` handler (after its closing `});`, around line 377):

```ts
  const TRIAGE_MODEL = process.env.TRIAGE_MODEL ?? "claude-haiku-4-5-20251001";

  function fallbackTriage(cfg: DemoScenario): { diagnosis: string; suspectedRootCause: string } {
    return {
      diagnosis: `${cfg.symptom}. Observed: ${cfg.sampleLog}`,
      suspectedRootCause: cfg.rootCause,
    };
  }

  app.post("/triage", async (c) => {
    const body = await c.req.json<{ scenario?: string }>().catch(() => ({}) as { scenario?: string });
    const scenario = body.scenario ?? "";
    const cfg = DEMO_SCENARIOS[scenario];
    if (!cfg) return c.json({ error: "unknown scenario" }, 404);

    const prompt = [
      "You are Argus, an autonomous SRE triage agent. A production incident just fired.",
      `Service: ${cfg.service}`,
      `Symptom: ${cfg.symptom}`,
      `Key metric: ${cfg.metric.label}=${cfg.metric.value} (trend ${cfg.metric.trend})`,
      `Sample log: ${cfg.sampleLog}`,
      "",
      'Give a first-pass triage. Respond ONLY with JSON of the form {"diagnosis": "<1-2 sentences, observational and precise>", "suspectedRootCause": "<short phrase>"}.',
    ].join("\n");

    try {
      const res = await deps.gateway.chat({
        provider: "claude",
        model: TRIAGE_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
        maxTokens: 300,
        responseFormat: "json_object",
      });
      const parsed = JSON.parse(res.text) as { diagnosis?: string; suspectedRootCause?: string };
      if (!parsed.diagnosis || !parsed.suspectedRootCause) throw new Error("incomplete triage");
      return c.json({ diagnosis: parsed.diagnosis, suspectedRootCause: parsed.suspectedRootCause });
    } catch {
      return c.json(fallbackTriage(cfg));
    }
  });
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @argus/orchestrator exec vitest run test/triage.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck the orchestrator**

Run: `pnpm --filter @argus/orchestrator exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/orchestrator/src/server.ts apps/orchestrator/test/triage.test.ts
git commit -m "orchestrator: add /triage fast-diagnosis endpoint"
```

---

### Task 2: Scaffold `apps/ridgeline` app shell

**Files:**
- Create: `apps/ridgeline/package.json`
- Create: `apps/ridgeline/tsconfig.json`
- Create: `apps/ridgeline/next.config.ts`
- Create: `apps/ridgeline/postcss.config.mjs`
- Create: `apps/ridgeline/next-env.d.ts` (generated by Next on first run — do not hand-write)
- Create: `apps/ridgeline/app/globals.css`
- Create: `apps/ridgeline/app/layout.tsx`
- Create: `apps/ridgeline/app/page.tsx`
- Modify: `package.json` (root — add `dev:ridgeline` script)

**Reference:** copy `apps/web/tsconfig.json` and `apps/web/postcss.config.mjs` verbatim. Mirror `apps/web/next.config.ts`.

- [ ] **Step 1: Create `apps/ridgeline/package.json`**

```json
{
  "name": "@argus/ridgeline",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev -p 3001",
    "build": "next build",
    "start": "next start -p 3001"
  },
  "dependencies": {
    "next": "16.2.6",
    "react": "19.2.4",
    "react-dom": "19.2.4"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4",
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "tailwindcss": "^4",
    "typescript": "^5"
  }
}
```

- [ ] **Step 2: Copy tooling config from `apps/web`**

Run:
```bash
cp apps/web/tsconfig.json apps/ridgeline/tsconfig.json
cp apps/web/postcss.config.mjs apps/ridgeline/postcss.config.mjs
```

- [ ] **Step 3: Create `apps/ridgeline/next.config.ts`**

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: false,
};

export default nextConfig;
```

- [ ] **Step 4: Create `apps/ridgeline/app/globals.css`**

Use the Ridgeline brand tokens (warm-dark) as the app base. These mirror the `--brand-*` values in `apps/web/components/distress/brand.tsx`:

```css
@import "tailwindcss";

@theme inline {
  --color-bg: oklch(0.100 0.008 45);
  --color-surface: oklch(0.140 0.010 45);
  --color-surface-2: oklch(0.180 0.012 45);
  --color-border: oklch(0.260 0.012 45);
  --color-border-strong: oklch(0.420 0.014 45);
  --color-fg: oklch(0.960 0.006 80);
  --color-fg-muted: oklch(0.700 0.010 60);
  --color-fg-dim: oklch(0.520 0.012 50);
  --color-accent: oklch(0.780 0.200 142);
  --color-accent-fg: oklch(0.120 0.010 45);
  --color-danger: oklch(0.660 0.200 22);
  --color-danger-soft: oklch(0.360 0.130 22);
  --color-warn: oklch(0.780 0.130 78);
  --color-success: oklch(0.740 0.150 150);

  --font-mono: var(--font-geist-mono), ui-monospace, monospace;
  --font-display: var(--font-display), ui-sans-serif, system-ui, sans-serif;

  --radius-sm: 0;
  --radius-md: 0;
  --radius-lg: 0;
}

html, body {
  background: var(--color-bg);
  color: var(--color-fg);
  font-family: var(--font-mono);
  -webkit-font-smoothing: antialiased;
}
```

- [ ] **Step 5: Create `apps/ridgeline/app/layout.tsx`**

The launcher and fault provider are added in later tasks; this is the minimal shell.

```tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono, DM_Sans } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const dmSans = DM_Sans({ variable: "--font-display", subsets: ["latin"], weight: ["400", "500", "600", "700"] });

export const metadata: Metadata = {
  title: "Ridgeline",
  description: "Data pipeline platform.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${dmSans.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
```

- [ ] **Step 6: Create `apps/ridgeline/app/page.tsx`** (temporary landing, replaced/extended in Task 4)

```tsx
import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto max-w-[900px] px-8 py-20">
      <h1 className="font-display text-[40px] font-light tracking-[-0.02em]">Ridgeline</h1>
      <p className="mt-4 text-[14px] text-[var(--color-fg-muted)]">Data pipeline platform.</p>
      <ul className="mt-8 space-y-2 text-[13px]">
        <li><Link href="/login" className="underline underline-offset-4">Sign In</Link></li>
        <li><Link href="/query" className="underline underline-offset-4">Query Studio</Link></li>
        <li><Link href="/jobs" className="underline underline-offset-4">Batch Jobs</Link></li>
      </ul>
    </main>
  );
}
```

- [ ] **Step 7: Add root `dev:ridgeline` script**

In root `package.json`, add to `scripts` after `"dev:web"`:

```json
    "dev:ridgeline": "pnpm --filter @argus/ridgeline dev",
```

- [ ] **Step 8: Install and verify the app boots**

Run:
```bash
pnpm install
pnpm --filter @argus/ridgeline exec tsc --noEmit
pnpm dev:ridgeline
```
Expected: `tsc` clean; Next dev server starts on `http://localhost:3001`. Open it, confirm the landing page with three links renders. Stop the server (Ctrl-C).

- [ ] **Step 9: Commit**

```bash
git add apps/ridgeline package.json pnpm-lock.yaml
git commit -m "ridgeline: scaffold standalone app shell on :3001"
```

---

### Task 3: Ridgeline API client + fault context

**Files:**
- Create: `apps/ridgeline/lib/api.ts`
- Create: `apps/ridgeline/lib/fault-context.tsx`

**Contract:** `api.ts` exposes `triage(scenario)`, `startScenario(scenario)`, and `argusIncidentUrl(id)`. `fault-context.tsx` provides a `FaultProvider` + `useFault()` hook holding the currently-raised fault (or null) so any page can raise it and the launcher can read it.

- [ ] **Step 1: Create `apps/ridgeline/lib/api.ts`**

```ts
const ORCH = process.env.NEXT_PUBLIC_ORCH_URL ?? "http://127.0.0.1:7200";
const ARGUS_APP = process.env.NEXT_PUBLIC_ARGUS_APP_URL ?? "http://localhost:3000";

export interface Triage {
  diagnosis: string;
  suspectedRootCause: string;
}

export async function triage(scenario: string): Promise<Triage> {
  const r = await fetch(`${ORCH}/triage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ scenario }),
  });
  if (!r.ok) throw new Error(`triage ${r.status}`);
  return (await r.json()) as Triage;
}

export async function startScenario(scenario: string): Promise<{ id: string }> {
  const r = await fetch(`${ORCH}/scenarios/${scenario}/start`, { method: "POST" });
  if (!r.ok) throw new Error(`scenario start ${r.status}`);
  return (await r.json()) as { id: string };
}

export function argusIncidentUrl(id: string): string {
  return `${ARGUS_APP}/incident/${id}`;
}
```

- [ ] **Step 2: Create `apps/ridgeline/lib/fault-context.tsx`**

```tsx
"use client";
import { createContext, useContext, useState, type ReactNode } from "react";

export interface Fault {
  scenario: string;
  service: string;
  symptom: string;
}

interface FaultState {
  fault: Fault | null;
  raise: (fault: Fault) => void;
  clear: () => void;
}

const FaultCtx = createContext<FaultState | null>(null);

export function FaultProvider({ children }: { children: ReactNode }) {
  const [fault, setFault] = useState<Fault | null>(null);
  return (
    <FaultCtx.Provider value={{ fault, raise: setFault, clear: () => setFault(null) }}>
      {children}
    </FaultCtx.Provider>
  );
}

export function useFault(): FaultState {
  const ctx = useContext(FaultCtx);
  if (!ctx) throw new Error("useFault must be used within FaultProvider");
  return ctx;
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @argus/ridgeline exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/ridgeline/lib
git commit -m "ridgeline: orchestrator api client + fault context"
```

---

### Task 4: Brand chrome, layout wiring, and Argus launcher

This task has a **required shape gate**. The launcher is the signature visual of the feature.

**Files:**
- Create: `apps/ridgeline/components/brand.tsx` (Ridgeline nav/chrome, extracted from `apps/web/components/distress/brand.tsx`)
- Create: `apps/ridgeline/components/argus-launcher.tsx`
- Modify: `apps/ridgeline/app/layout.tsx` (wrap children in `FaultProvider`, render chrome + launcher)

**Launcher behavioral contract (this is fixed; the visual treatment is what gets shaped):**
- Reads `useFault()`. When `fault === null`, renders the idle square Argus launcher pinned bottom-right.
- When a `fault` is raised, the launcher flares and immediately calls `triage(fault.scenario)`; while pending it shows a reasoning/pulse state; on resolve it shows `diagnosis` + `suspectedRootCause`.
- Toast shows a primary CTA "Open investigation →" whose `onClick` runs the handoff: `startScenario(fault.scenario)` → `window.location.href = argusIncidentUrl(id)`. On `startScenario` error, show an inline error and keep the toast open (mirror `apps/web/components/distress/trigger.tsx`).
- Toast is dismissible back to the idle launcher; re-opening shows the cached diagnosis (do not re-call triage).

- [ ] **Step 1: Extract the Ridgeline brand chrome**

Create `apps/ridgeline/components/brand.tsx` by porting `BrandChrome`, `BrandButton`, and the `RIDGELINE_CSS` token block from `apps/web/components/distress/brand.tsx`. Drop the `surfaceLabel`-specific "STATUS: DEGRADED" status bar coupling if not needed for a healthy page; keep nav (`Overview / Pipelines / Connections / Deploys / Settings`), wordmark, and the grid backdrop. Replace the `@/lib/utils` `cn` import with a local 1-line `cn` (`apps/ridgeline` has no `lib/utils` yet) or copy `apps/web/lib/utils.ts` to `apps/ridgeline/lib/utils.ts`.

Verify after writing: `pnpm --filter @argus/ridgeline exec tsc --noEmit` is clean.

- [ ] **Step 2: Run the shape gate for the launcher**

Invoke `$impeccable shape` for the Argus launcher (idle square → flared toast with triage diagnosis + CTA, bottom-right, "pops with drama"). Reference the approved design in `docs/specs/2026-05-26-ridgeline-app-argus-extension-design.md` §3. Present the shape brief and **wait for explicit user approval** before writing the component's visuals.

- [ ] **Step 3: Build `apps/ridgeline/components/argus-launcher.tsx` (craft)**

After the brief is approved, run `$impeccable craft` to build the launcher implementing the behavioral contract above. It is a `"use client"` component using `useFault()`, `triage()`, `startScenario()`, `argusIncidentUrl()`. Motion: ease-out (quart/expo), no bounce; do not animate layout properties.

**Acceptance criteria (verify in browser, Task 8 covers full E2E):**
- Idle launcher visible bottom-right on every page.
- Raising a fault flares the launcher and opens the toast.
- Toast shows the triage diagnosis text and suspected root cause.
- "Open investigation →" navigates to `http://localhost:3000/incident/<id>`.

- [ ] **Step 4: Wire the layout**

Modify `apps/ridgeline/app/layout.tsx` body to wrap children in `FaultProvider` and render the launcher globally:

```tsx
import { FaultProvider } from "@/lib/fault-context";
import { ArgusLauncher } from "@/components/argus-launcher";
// ...existing font + metadata code unchanged...

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${dmSans.variable} h-full antialiased`}>
      <body className="min-h-full">
        <FaultProvider>
          {children}
          <ArgusLauncher />
        </FaultProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 5: Typecheck + visual smoke**

Run: `pnpm --filter @argus/ridgeline exec tsc --noEmit` (clean), then `pnpm dev:ridgeline` and confirm the idle launcher renders bottom-right on the landing page. Stop the server.

- [ ] **Step 6: Commit**

```bash
git add apps/ridgeline/components apps/ridgeline/lib apps/ridgeline/app/layout.tsx
git commit -m "ridgeline: brand chrome + global Argus launcher"
```

---

### Task 5: `/login` page — manual auth-5xx trigger

**Files:**
- Create: `apps/ridgeline/app/login/page.tsx`

**Trigger contract:** A Sign In form. On submit, set a local "failing" state (show a 503 / sign-in error in the product UI) and call `raise({ scenario: "auth-5xx", service: "auth", symptom: "Logins failing, 503 rate climbing on auth" })` from `useFault()`. Any credentials are accepted as input; the fault is what fires.

- [ ] **Step 1: Run the shape gate**

Invoke `$impeccable shape` for the Sign In surface (healthy form → error/distress state on submit). Use the existing `sign-in` distress surface in `apps/web/components/distress/surfaces.tsx` as the visual reference. Wait for user approval of the brief.

- [ ] **Step 2: Build `/login/page.tsx` (craft)**

After approval, `$impeccable craft` the page. It must be a `"use client"` component that:
- renders the Ridgeline-branded sign-in form,
- on submit shows the product error state,
- calls `useFault().raise({ scenario: "auth-5xx", service: "auth", symptom: "Logins failing, 503 rate climbing on auth" })`.

- [ ] **Step 3: Typecheck + manual check**

Run: `pnpm --filter @argus/ridgeline exec tsc --noEmit` (clean). With orchestrator (`pnpm dev:orch`) + cluster running and `pnpm dev:ridgeline`, open `/login`, submit, and confirm: the form enters its error state AND the Argus launcher flares + pops the triage toast.

- [ ] **Step 4: Commit**

```bash
git add apps/ridgeline/app/login
git commit -m "ridgeline: /login sign-in surface with auth-5xx trigger"
```

---

### Task 6: `/query` page — manual db-saturation trigger

**Files:**
- Create: `apps/ridgeline/app/query/page.tsx`

**Trigger contract:** A Query Studio editor. Operator types/pastes a query and clicks Run. The query spins, then resolves into a timeout/error product state, and on that resolution call `raise({ scenario: "db-saturation", service: "db_proxy", symptom: "Query p99 at 1.5s, connection pool saturating" })`.

- [ ] **Step 1: Run the shape gate**

`$impeccable shape` for Query Studio (editor + result pane; healthy → timing-out). Reference the `query-studio` surface in `apps/web/components/distress/surfaces.tsx`. Wait for approval.

- [ ] **Step 2: Build `/query/page.tsx` (craft)**

After approval, `$impeccable craft`. `"use client"`; a query textarea + Run button; on Run, show a spinner then a timeout error result, then call `useFault().raise({ scenario: "db-saturation", service: "db_proxy", symptom: "Query p99 at 1.5s, connection pool saturating" })`.

- [ ] **Step 3: Typecheck + manual check**

`pnpm --filter @argus/ridgeline exec tsc --noEmit` clean. Open `/query`, paste a query, click Run → confirm timeout state + launcher toast fires.

- [ ] **Step 4: Commit**

```bash
git add apps/ridgeline/app/query
git commit -m "ridgeline: /query studio surface with db-saturation trigger"
```

---

### Task 7: `/jobs` page — automatic worker-oom trigger

**Files:**
- Create: `apps/ridgeline/app/jobs/page.tsx`

**Trigger contract:** A Batch Jobs console. On mount, simulated jobs populate and progress bars advance on a timer (`setInterval`). A "worker heap" gauge climbs; when it crosses a threshold (or after a fixed delay, e.g. 6s), one job stalls/errors, the page enters distress, and `raise({ scenario: "worker-oom", service: "worker", symptom: "Worker heap climbing, job queue backing up" })` fires exactly once. Clean up the interval on unmount.

- [ ] **Step 1: Run the shape gate**

`$impeccable shape` for Batch Jobs (job table + progress + heap gauge; healthy → one worker OOMing). Reference the `batch-console` surface in `apps/web/components/distress/surfaces.tsx`. Wait for approval.

- [ ] **Step 2: Build `/jobs/page.tsx` (craft)**

After approval, `$impeccable craft`. `"use client"`; on mount start a `setInterval` that advances job progress and a heap value; when heap crosses threshold, mark a job failed, set distress state, and call `raise(...)` once (guard with a ref so it fires a single time). Clear the interval in the effect cleanup.

The auto-fire timing must be guarded so it raises exactly once:

```tsx
const raisedRef = useRef(false);
// inside the tick, when threshold crossed:
if (!raisedRef.current) {
  raisedRef.current = true;
  raise({ scenario: "worker-oom", service: "worker", symptom: "Worker heap climbing, job queue backing up" });
}
```

- [ ] **Step 3: Typecheck + manual check**

`pnpm --filter @argus/ridgeline exec tsc --noEmit` clean. Open `/jobs`, wait → confirm jobs animate, heap climbs, one job fails, and the launcher toast fires automatically (only once).

- [ ] **Step 4: Commit**

```bash
git add apps/ridgeline/app/jobs
git commit -m "ridgeline: /jobs batch console with auto worker-oom trigger"
```

---

### Task 8: End-to-end handoff verification

**Files:** none (verification + optional `.env` doc)

- [ ] **Step 1: Bring up the full stack**

In separate terminals (or backgrounded):
```bash
pnpm dev:cluster
pnpm dev:orch
pnpm dev:web        # Argus app on :3000
pnpm dev:ridgeline  # Ridgeline on :3001
```

- [ ] **Step 2: Run each hero flow end to end**

For each of `/login` (submit), `/query` (paste + Run), `/jobs` (wait for auto-fire):
1. Trigger the fault.
2. Confirm the product UI enters distress.
3. Confirm the Argus launcher flares and the toast shows a triage diagnosis (grounded in that scenario's symptoms, not generic).
4. Click "Open investigation →".
5. Confirm the browser lands on `http://localhost:3000/incident/<id>` and a live Argus investigation is running.

- [ ] **Step 3: Confirm triage fallback path**

Temporarily stop the orchestrator's upstream model access is not required; instead verify the fallback unit test already covers it (Task 1, step 4). For the live path, confirm the toast is never empty even if triage is slow (it shows the pulse state, then fills).

- [ ] **Step 4: Full typecheck sweep**

Run:
```bash
pnpm --filter @argus/orchestrator exec tsc --noEmit
pnpm --filter @argus/ridgeline exec tsc --noEmit
pnpm --filter @argus/web exec tsc --noEmit
```
Expected: all clean.

- [ ] **Step 5: Report results**

Summarize: which flows passed, any grounding/latency observations on the triage diagnosis, and confirm the deep-link origin switch works. No commit for this task unless docs were added.

---

## Notes on env

Ridgeline reads (with safe localhost defaults, so no `.env` is required for the demo):
- `NEXT_PUBLIC_ORCH_URL` (default `http://127.0.0.1:7200`)
- `NEXT_PUBLIC_ARGUS_APP_URL` (default `http://localhost:3000`)

Orchestrator triage model: `TRIAGE_MODEL` (default `claude-haiku-4-5-20251001`).
