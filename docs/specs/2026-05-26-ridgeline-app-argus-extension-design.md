# Ridgeline App + Argus Extension — Design

**Date:** 2026-05-26
**Status:** Approved (brainstorm), ready for implementation plan

## Goal

Turn Ridgeline from a set of static distress surfaces into a standalone, navigable web app where an operator performs ordinary actions (sign in, run a query, watch batch jobs) that organically trigger production faults. When a fault fires, an embedded Argus "extension" — a square launcher pinned bottom-right — pops open with a real, LLM-generated initial triage diagnosis and a link into the full Argus investigation. The demo narrative becomes: *use a real product → it breaks → Argus notices and triages → click through to watch Argus work the incident.*

## Architecture overview

- **New app `apps/ridgeline`** runs on port **3001**, separate from the existing Argus app (`apps/web`, port 3000).
- Both apps talk to the **same orchestrator** (`apps/orchestrator`, port 7200). Ridgeline does not embed Argus UI; it deep-links to it.
- The orchestrator gains one new endpoint, `POST /triage`, that performs a single fast model call and returns a short initial diagnosis. The existing `POST /scenarios/:id/start` (startScenario) flow is unchanged.
- Handoff: Ridgeline starts the scenario via the orchestrator, gets an incident id, then navigates the browser to `http://localhost:3000/incident/[id]` (the existing Argus incident view).

```
operator → apps/ridgeline (:3001)
              │  product interaction triggers fault
              │  POST /triage  ──────────────► orchestrator (:7200) ── fast model call
              │  ◄── { diagnosis, suspectedRootCause }
              │  Argus launcher pops toast
              │  "Open investigation" → POST /scenarios/:id/start → { incidentId }
              ▼
           window.location = http://localhost:3000/incident/[incidentId]
                                          │
                              apps/web (:3000) reads incident from orchestrator (:7200)
```

## Components

### 1. `apps/ridgeline` — the app shell

A new Next app (same Next version + conventions as `apps/web`; read `node_modules/next/dist/docs/` before coding — this Next has breaking changes). It carries the Ridgeline brand only — no Argus chrome except the embedded launcher.

**Brand chrome.** Extract the Ridgeline shell currently living in `apps/web/components/distress/brand.tsx` (`BrandChrome`, `BrandButton`, the `--brand-*` token CSS) into the new app. The new app's root layout renders the nav (Overview / Pipelines / Connections / Deploys / Settings), a status bar, and the Argus launcher globally.

**Pages (hands-on):**
- `/login` — Sign In surface (scenario `auth-5xx`).
- `/query` — Query Studio surface (scenario `db-saturation`).
- `/jobs` — Batch Jobs surface (scenario `worker-oom`).

The three remaining scenarios (`api-brownout`, `db-timeout`, `api-config-drift`) are **out of scope** for Ridgeline pages; they remain triggerable from the existing `/status` board in `apps/web`.

The existing 6 distress surface components in `apps/web/components/distress/surfaces.tsx` are the visual reference for these three pages; the Ridgeline versions are interactive variants, not static renders.

### 2. Trigger semantics (per page)

Each hero page fires its fault through a different, page-appropriate interaction. "Fault fires" means: the product UI visibly degrades into its error/distress state, **and** the Argus launcher is notified locally (in-app state) to begin its triage + pop sequence.

- **`/jobs` (worker-oom) — automatic on activity.** On page visit, a simulated batch-jobs table populates and progress bars advance on a timer. One worker's memory gauge climbs; when it crosses a threshold (or after a fixed delay), the fault fires: that job stalls/errors and the page enters distress.
- **`/login` (auth-5xx) — manual.** Operator types any credentials and clicks Sign In. The request "fails" with a 5xx; repeated attempts deepen the distress. The fault fires on the click.
- **`/query` (db-saturation) — manual.** Operator pastes/types a query and clicks Run. The query spins, then times out / errors. The fault fires on the click.

Trigger state is local to the Ridgeline app (React state / context). The fault does **not** auto-start an orchestrator incident; it only (a) degrades the product UI and (b) tells the launcher to triage.

### 3. Argus extension — the launcher

A global client component mounted in the Ridgeline layout, pinned bottom-right.

- **Idle state:** a small square Argus logo button, calm/neutral tone, unobtrusive. Present on every page.
- **On fault:** flares to the danger accent and pops open a toast panel "with drama" (slide/scale up from the corner, ease-out, no bounce). The toast shows:
  - a header (`◆ Argus detected an incident`),
  - the affected service + one-line symptom,
  - the **triage diagnosis** (from `/triage`) with a suspected root cause,
  - a primary CTA: **Open investigation →**.
- While the triage call is in flight, the toast shows a brief reasoning/pulse state, then fills in the diagnosis.
- The toast is dismissible back to the idle launcher; re-opening shows the same diagnosis.

The launcher reads fault state from a shared Ridgeline context so any of the three pages can raise it. The launcher owns the `/triage` fetch and the handoff click.

### 4. Triage endpoint — `POST /triage`

New orchestrator route. Input: `{ scenario: string }`. Behavior:

- Look up the scenario's existing symptom/signal data (the same metadata the scenarios already carry in `apps/orchestrator/src/server.ts`) so the prompt is grounded, not generic.
- Make **one** fast single-shot model call through the existing gateway / provider registry (keys stay server-side). Use a fast model tier.
- Prompt: given the scenario's symptoms/signals, produce a 1–2 sentence initial triage diagnosis plus a short suspected root cause. No tools, no loop.
- Response: `{ diagnosis: string, suspectedRootCause: string }`.

This is deliberately separate from the full conductor run. It is cheap, fast, and demo-safe; if the model is slow the toast simply shows its pulse state a beat longer. (Optional, decide in plan: a scripted fallback string per scenario if the call errors, so the demo never shows an empty toast.)

### 5. Handoff

The "Open investigation" CTA:

1. Calls `startScenario(scenario)` against the orchestrator → `{ incidentId }`.
2. Navigates the browser: `window.location.href = http://localhost:3000/incident/${incidentId}`.

The Argus app (`apps/web`) is unchanged — it loads the incident from the shared orchestrator exactly as it does today. The cross-origin base URL (`http://localhost:3000`) is read from a Ridgeline env var (e.g. `NEXT_PUBLIC_ARGUS_APP_URL`) so it is not hardcoded.

## Data flow summary

1. Operator interacts → fault fires locally → product UI degrades + launcher notified.
2. Launcher `POST /triage { scenario }` → orchestrator one-shot model call → `{ diagnosis, suspectedRootCause }`.
3. Toast pops, shows diagnosis.
4. Operator clicks Open investigation → `startScenario` → `incidentId` → browser navigates to Argus app `/incident/[id]` on :3000.
5. Argus app runs the real investigation against the same orchestrator.

## Error handling

- **Triage call fails or is slow:** launcher keeps its pulse state; on hard error, fall back to a per-scenario scripted diagnosis string (decide in plan) so the toast is never empty. The Open investigation CTA stays enabled regardless — triage failure must not block the handoff.
- **startScenario fails:** surface a small inline error in the toast (mirrors the existing `DistressTrigger` error pattern in `apps/web/components/distress/trigger.tsx`); do not navigate.
- **Argus app unreachable at :3000:** out of scope to handle gracefully; both apps are expected up during the demo.

## Testing

- **Orchestrator:** unit/integration test for `POST /triage` — valid scenario returns non-empty `diagnosis` + `suspectedRootCause`; unknown scenario returns a 4xx; the route makes exactly one model call (mock the gateway).
- **Ridgeline pages:** verify each trigger path raises fault state — `/jobs` auto-fires after its timer/threshold, `/login` fires on Sign In click, `/query` fires on Run click.
- **Launcher:** idle → fault → toast-with-diagnosis transition; Open investigation triggers startScenario then navigation (assert the constructed URL).
- **Manual demo pass:** run each of the three hero flows end to end in the browser, confirm the toast diagnosis reads grounded, and confirm the deep-link lands on a live Argus incident at :3000.

## Out of scope

- Ridgeline pages for `api-brownout`, `db-timeout`, `api-config-drift` (stay on the `/status` board).
- Embedding the Argus investigation view inside Ridgeline.
- Real authentication (login is simulated; any credentials "work" until the fault).
- Persisting Ridgeline session/app state across reloads.

## Ports / env

- `apps/ridgeline` dev server: **3001**.
- `apps/web` (Argus): 3000 (unchanged).
- `apps/orchestrator`: 7200 (unchanged).
- Ridgeline env: `NEXT_PUBLIC_ARGUS_APP_URL` (default `http://localhost:3000`), orchestrator base URL (mirror how `apps/web/lib/api.ts` resolves it).
