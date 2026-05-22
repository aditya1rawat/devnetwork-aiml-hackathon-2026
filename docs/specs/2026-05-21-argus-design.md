# Argus — Design Spec

**Date:** 2026-05-21
**Hackathon:** DevNetwork [AI + ML] Hackathon 2026
**Submission deadline:** 2026-05-28 10:00 AM PST
**Sponsor tracks targeted:** TrueFoundry (Resilient Agents), Crusoe (Nemotron Agent)

---

## 1. One-liner

**Argus** is an autonomous on-call SRE agent that survives the infrastructure chaos it is responding to. Two cognitions — Claude (primary) and Nemotron-on-Crusoe (shadow) — execute the investigation in lockstep through TrueFoundry's AI Gateway. When the primary degrades, the shadow takes over with zero context loss. When the shadow disagrees with the primary, that disagreement is itself a signal — a built-in hallucination / drift detector.

**Tagline:** *"Highly-available web servers run on N machines. Why don't agents?"*

**Pitch hook:** Every team building agents hits this pain the moment they go to production. Argus is the answer.

## 2. Goals

1. Demonstrate an agent that **continues investigating a live incident while one or more LLM providers die mid-run** — without losing context, restarting, or replaying.
2. Demonstrate **dual-cognition execution** as both a failover mechanism AND a hallucination signal (primary vs shadow divergence).
3. Hit two sponsor tracks naturally:
   - **TrueFoundry** — agent's entire resilience story is built on their AI Gateway.
   - **Crusoe** — shadow agent runs Nemotron on Crusoe Managed Inference (the literal "Nemotron agent" deliverable).
4. Ship in 7 days, solo, as a demoable 90-second video + working live UI.

## 3. Non-goals

- Multi-incident concurrency.
- Real production observability integration in MVP (Sentry/Datadog hookup is a stretch goal).
- Fully autonomous remediation in MVP (read-only investigator; approval-gated remediation is post-MVP).
- LLM evaluation suites or accuracy benchmarks.
- Adversarial-prompt-injection hardening for log content.
- Perfect Corp track — clean abstention.

## 4. Architecture overview

```
┌──────────────────────────────────────────────────────────────────┐
│                       Argus Web UI (Next.js 16)                  │
│  ┌────────────────────┐  ┌─────────┐  ┌───────────────────────┐  │
│  │ Primary stream     │  │ Agree-  │  │ Shadow stream         │  │
│  │ (Claude reasoning) │  │ ment    │  │ (Nemotron reasoning)  │  │
│  └────────────────────┘  │ meter   │  └───────────────────────┘  │
│  Timeline · Chaos panel (kill provider / slow MCP / sever Gateway)│
└────────────────┬───────────────────────────────┬─────────────────┘
                 │ SSE stream                    │ control ws
                 ▼                               ▼
        ┌────────────────────────────────────────────────┐
        │         Argus Orchestrator (Node, AI SDK v6)   │
        │  ├─ Conductor: forks Primary + Shadow per step │
        │  ├─ State store: shared scratchpad + tool log  │
        │  ├─ Divergence detector: semantic diff outputs │
        │  └─ Failover controller: promote Shadow→Primary│
        └─────────┬───────────────────────────────┬──────┘
                  │                               │
        ┌─────────▼──────────┐         ┌──────────▼─────────────┐
        │ TrueFoundry        │         │ MCP tool servers       │
        │ AI Gateway         │         │ (logs, metrics,        │
        │  ├─ Claude         │         │  traces, runbook)      │
        │  └─ Nemotron       │         │  — wrapped w/ retry +  │
        │     (Crusoe)       │         │     circuit breaker    │
        └────────────────────┘         └────────┬───────────────┘
                                                │
                                       ┌────────▼─────────┐
                                       │ Mock services    │
                                       │ (FastAPI, 3-4)   │
                                       │  + chaos hooks   │
                                       └──────────────────┘
```

**Key invariants:**

- Every reasoning step is issued to **both** providers via the Gateway.
- Tool calls execute exactly once (primary's choice). The shadow receives the same tool result.
- Shadow may lag the primary by at most 1 step. If it falls behind by ≥2, the conductor pauses the primary until the shadow catches up.
- Failover detects primary error / timeout / brownout → promote shadow to primary slot → allocate a new shadow on a different provider. State is preserved.
- Divergence compares each step's structured output (action + args + rationale) between primary and shadow. Threshold breach flags but does not halt the investigation.

## 5. Components

### 5.1 Mock Service Cluster
**Location:** `services/mock-cluster/`
**Stack:** Python FastAPI

- 4 services: `api`, `worker`, `db-proxy`, `auth`.
- Each exposes `/health` and emits structured logs + Prometheus-style metrics on `/metrics`.
- Chaos hooks: `POST /chaos/inject` accepts `{type: latency|5xx|memleak|crash, target, duration}`.
- One scripted scenario at boot: `worker` slowly leaks memory, eventually OOMs, causing cascading 503s in `api`.

### 5.2 Tool MCP Servers
**Location:** `mcp/`
**Transport:** stdio JSON-RPC

- `logs-mcp` — tail / grep / structured search of cluster logs.
- `metrics-mcp` — query Prometheus metrics with time-range aggregations.
- `traces-mcp` — span queries + bottleneck identification on a mock OTel feed.
- `runbook-mcp` — static markdown runbooks indexed by service name.

### 5.3 Argus Orchestrator
**Location:** `apps/orchestrator/`
**Stack:** Node + AI SDK v6

- `conductor.ts` — main step loop; fans each step to primary + shadow.
- `gateway.ts` — TrueFoundry AI Gateway client (OpenAI-compatible HTTP). Owns health tracking per provider.
- `mcp-pool.ts` — manages MCP server processes; wraps each tool call with retry, timeout, and circuit breaker.
- `state.ts` — shared agent state: message history, tool log, scratchpad, current hypotheses.
- `divergence.ts` — structural + semantic diff between primary and shadow step outputs.
- `failover.ts` — detects unhealthy provider, promotes shadow to primary, allocates new shadow.
- `chaos.ts` — HTTP endpoints the UI calls to inject failures into providers, Gateway, MCP servers, or mock services.

### 5.4 Web UI
**Location:** `apps/web/`
**Stack:** Next.js 16 App Router

- `/incident/[id]` — split-screen dual-stream view (default).
- `/incident/[id]?mode=single` — single-pane fallback view (shadow hidden until takeover).
- `/observability` — stretch goal: Datadog-style charts page reading mock metrics.
- Server Actions for chaos panel: kill provider, sever Gateway, throttle MCP, crash service.
- Streaming via AI SDK + SSE; chaos events broadcast on a shared channel.

### 5.5 Interfaces (only boundary crossings)

- Orchestrator ↔ Gateway: OpenAI-compatible chat completions HTTP.
- Orchestrator ↔ MCP servers: stdio JSON-RPC.
- UI ↔ Orchestrator: SSE for streams + WebSocket for chaos control.
- Mock services ↔ MCP servers: HTTP (`/logs`, `/metrics`, `/traces`).

## 6. Data flow

### 6.1 Incident trigger

Mock `worker` service emits `OutOfMemoryError` log line + 503 spike on `api`. `logs-mcp` exposes the new error pattern. The orchestrator either polls or receives a webhook `POST /incident` and spawns incident `inc_xyz`.

### 6.2 Step loop (`conductor.ts`)

```
loop:
  1. Build prompt from shared state (history + tool log + scratchpad).
  2. Fan out: gateway.complete(provider="claude", prompt) || gateway.complete(provider="nemotron", prompt)
  3. Await both with timeout T.
     - If primary errors or times out → failover.promote(shadow).
  4. Parse structured outputs: {action, args, rationale, hypotheses}.
  5. divergence.compare(primary_out, shadow_out) → score.
     - Score > threshold → flag in UI; do NOT halt.
  6. Execute primary.action via mcp-pool (e.g., logs-mcp.search(...)).
  7. Append tool result to state — both agents see it next step.
  8. If action == "report" → emit final report; end loop.
  9. Push step deltas to UI via SSE.
```

### 6.3 Chaos path (user clicks "Kill Claude" mid-step 4)

- Chaos endpoint marks provider-Claude unhealthy in the Gateway client.
- Next call to Claude returns 503 → `failover.promote`:
  - Shadow (Nemotron) becomes the primary.
  - State carries forward unchanged — this is the wow: no context rebuild, no replay.
  - A new shadow is provisioned on the next available provider (Claude after cooldown, or a third configured provider).
- UI: divider animates; agreement meter resets; new shadow stream begins.
- Investigation continues from the exact same step.

### 6.4 Streaming protocol (orchestrator → UI)

```
event: primary_token   data: {step, delta}
event: shadow_token    data: {step, delta}
event: tool_call       data: {step, tool, args}
event: tool_result     data: {step, result}
event: divergence      data: {step, score, diff_summary}
event: failover        data: {old, new, reason}
event: incident_done   data: {report_md}
```

### 6.5 Persistence

- In-memory per incident for MVP.
- SQLite append-only snapshot for replay — stretch.

## 7. Error handling and resilience semantics

This section IS the product. Designed with care.

### 7.1 Provider failures (`failover.ts`)

- **Hard error (4xx/5xx/network):** immediate promote shadow → primary; allocate new shadow.
- **Timeout exceeding step budget (default 30s):** treated as hard error.
- **Brownout (latency p95 > 3× baseline over rolling 60s window):** preemptive promote — *predictive resilience*.
- **Rate limit (429):** exponential backoff with jitter. If backoff exceeds step budget, promote.
- **Cooldown:** failed provider quarantined for 60s before re-eligible as a shadow.

### 7.2 Gateway failure (TrueFoundry Gateway itself down)

- Direct-to-provider fallback: orchestrator caches provider credentials and bypasses the Gateway.
- UI surfaces a "DEGRADED — direct mode" banner.
- Gateway routing resumes on the first successful health-check probe.

### 7.3 MCP failures (`mcp-pool.ts`)

- Per-tool circuit breaker: 3 consecutive failures → open circuit for 30s.
- While open, tool calls return a synthetic envelope `{status: "unavailable", last_known: <cached>, hint: <suggested alternative tool>}`.
- Agent system prompt instructs: when a tool is unavailable, try an alternative or note the gap explicitly in the final report.
- Tool result cache: TTL 5 min, used during the open-circuit window.

### 7.4 Divergence handling

- Threshold breach (cosine < 0.6 on rationale embeddings OR structural action mismatch) → flag in UI; do NOT halt. Embedding model is an implementation detail — small local model (e.g., `nomic-embed-text` via Ollama) or a Gateway-hosted small embed model; chosen during build.
- Material disagreement (different tool or different target) → log as a "counterfactual" — surfaced in the final report as "shadow disagreed."
- Three consecutive divergences on critical actions → pause for human attention (only relevant once remediation mode is enabled).

### 7.5 State integrity

- Every step's `(primary_out, shadow_out, tool_result)` is written to an append-only log before the next step begins.
- On orchestrator crash, incident state is recoverable from log replay.
- Shadow promotion never rewrites history — it only changes which provider gets called next.

### 7.6 Hallucination signals surfaced in UI

- Divergence meter (real-time).
- Counterfactual list (where the shadow would have done X instead).
- Confidence score (agreement across the last N steps).

### 7.7 Acknowledged gaps (not handled in MVP)

- Both providers down simultaneously → incident enters a "waiting" state; UI shows "blind."
- MCP server returns wrong-but-valid data (semantic correctness) → out of scope.
- Adversarial prompt injection from log content → out of scope (called out in pitch).

## 8. Testing strategy

### 8.1 Unit (fast, no LLM calls)

- `divergence.compare` — golden pairs (identical / similar / different / wildly-different) → expected score buckets.
- `mcp-pool` circuit breaker state machine — closed → open → half-open transitions.
- `failover.promote` — state carries; shadow allocation excludes quarantined providers.
- `gateway` client — 503 throws typed error; 429 backoff schedule honored.
- Chaos endpoints idempotent + reversible.

### 8.2 Integration (LLM-mocked, deterministic)

- Mock Gateway server returns scripted responses per provider.
- Full step-loop on a canned incident → assert tool-call sequence + final report shape.
- Inject provider death at step N → assert failover, state preserved, loop continues.
- Inject MCP failure → assert circuit opens, synthetic envelope returned, agent adapts.
- Concurrent chaos (provider + MCP both die) → assert graceful degrade.

### 8.3 End-to-end (real Gateway, real Nemotron, scripted scenarios)

- Two canonical scenarios for demo:
  - `worker-oom` — memory leak → OOM → cascading 503s.
  - `db-saturation` — slow query → connection pool exhausted → auth timeouts.
- Each runs end-to-end on real LLMs at least once before demo.
- Snapshot final report shape; allow content drift.

### 8.4 Demo-day rehearsal suite

- Scripted chaos timeline: T+30s kill Claude, T+90s sever Gateway, T+150s restore Gateway.
- Replay 5× leading up to the demo to ensure resilience holds with token variance.

### 8.5 Out of scope for testing

- LLM evaluation / accuracy benchmarks.
- Load testing.
- Multi-incident concurrency.

### 8.6 CI

- `npm test` runs unit + LLM-mocked integration.
- E2E runs locally only.

## 9. Scope cuts and 7-day budget

### 9.1 MVP (must ship by 2026-05-28)

- 1 chaos scenario end-to-end working (`worker-oom`).
- 4 MCP tools (logs / metrics / traces / runbook), all wrapped with circuit breaker.
- 4 mock services + chaos hooks.
- Resilience features that MUST work in MVP: hard-error failover, timeout failover, Gateway-down direct-mode fallback, MCP circuit breaker.
- Resilience features deferred to stretch if time-constrained: brownout/predictive-promote detection, divergence-based pause, log-replay crash recovery.
- Split-screen UI + chaos panel + agreement meter.
- Provider failover Claude ↔ Nemotron via TrueFoundry Gateway.
- Final markdown report.
- 90-second demo video.

### 9.2 Should-have if time allows

- 2nd scenario (`db-saturation`) — different agent reasoning path.
- Single-pane mode toggle.
- Failover during an ACTIVE tool call (mid-step) — harder than between-step.
- Divergence-history view (timeline of disagreements).

### 9.3 Stretch (post-MVP)

- Observability-style page (Datadog aesthetic).
- Approval-gated remediation mode.
- Auto-remediation toggle.
- Real-infra plug (Sentry MCP) instead of mocks.
- SQLite snapshot + replay.

### 9.4 Day-by-day

| Day | Date | Focus |
|-----|------|-------|
| Wed | 2026-05-21 | Scaffold monorepo. Mock services + chaos hooks. Stub MCP servers. |
| Thu | 2026-05-22 | TrueFoundry Gateway client. Crusoe Nemotron access verified. AI SDK integration. |
| Fri | 2026-05-23 | Conductor + state + step loop. Single-provider happy path on `worker-oom`. |
| Sat | 2026-05-24 | Shadow execution + divergence + failover. Provider chaos works. |
| Sun | 2026-05-25 | UI: split-screen, streaming, chaos panel. Polish reasoning rendering. |
| Mon | 2026-05-26 | MCP circuit breakers + Gateway-down direct fallback. Buffer for bugs. |
| Tue | 2026-05-27 | 2nd scenario + rehearsals. Devpost write-up draft. |
| Wed | 2026-05-28 | Demo video + submission (deadline 10:00 AM PST). |

**Buffer:** Day 26 + first half of 27 = ~1.5 days slack absorbed into demo polish.

### 9.5 Hard cutoffs

- Anything still broken Mon EOD → cut from MVP. Mention in pitch only if it actually works.
- Demo video locked Tue EOD; Wed morning is submission paperwork only.

## 10. Demo script

**90-second arc:**

1. **(0-10s)** Title card. *"Argus — AI on-call that survives the chaos it's responding to."*
2. **(10-25s)** Mock cluster healthy. Inject `worker-oom` chaos. Argus auto-detects incident. Split-screen lights up: Primary (Claude) + Shadow (Nemotron-on-Crusoe) start reasoning in lockstep.
3. **(25-50s)** Agents triangulate: logs → metrics → traces → hypothesis (memory leak in worker). Agreement meter ~94%. Tool calls visible on screen.
4. **(50-65s)** **Cut Anthropic.** Click "Kill Claude." Banner: *"Primary failed → promoting Shadow."* Reasoning stream continues uninterrupted on Nemotron. State intact. New shadow boots on alternate route.
5. **(65-80s)** **Cut TrueFoundry Gateway.** Banner: *"Gateway down → direct mode."* Agent finishes investigation. Final markdown report renders.
6. **(80-90s)** Pitch slide: *"Two cognitions. Zero context loss. Built on TrueFoundry Gateway + Crusoe Nemotron."* Logos. Submit.

## 11. Judging-criteria mapping

| Criterion | How Argus answers |
|-----------|-------------------|
| Progress (Round 1) | Working end-to-end demo of novel architecture in 7 days solo. |
| Concept (Round 1) | Every team building agents hits this pain in prod; nobody has answered it cleanly. |
| Feasibility (Round 1) | "HA pattern for agents" + on-call AI = converging Datadog / PagerDuty / Sentry interest. |
| TrueFoundry (Sponsor) | Resilience IS the product. Gateway routes both cognitions and survives its own failure. |
| Crusoe (Sponsor) | Nemotron-on-Crusoe is the Shadow. The moment Claude dies, Crusoe carries the demo. |
| Perfect Corp | Not pursued — clean abstention. |

## 12. Devpost submission fields

- **Elevator pitch:** *"Highly-available web servers run on N machines. Why don't agents?"*
- **Built with:** Next.js 16, AI SDK v6, TrueFoundry AI Gateway, Crusoe Cloud Managed Inference, Nemotron, MCP, FastAPI.
- **Story:** pain (agents fail when their LLM blinks) → insight (dual cognition is both failover AND a hallucination signal) → architecture (Gateway-routed lockstep execution) → demo (live chaos resilience).
- **Image gallery:** split-screen screenshot, agreement-meter close-up, failover banner, final report markdown.
- **Try it:** deployed Vercel URL + GitHub link.
- **Video demo:** the 90s script above.

## 13. Repo layout

```
devnetwork-hackathon-2026/
├── apps/
│   ├── orchestrator/        # Node + AI SDK v6
│   │   ├── conductor.ts
│   │   ├── gateway.ts
│   │   ├── mcp-pool.ts
│   │   ├── state.ts
│   │   ├── divergence.ts
│   │   ├── failover.ts
│   │   └── chaos.ts
│   └── web/                 # Next.js 16 App Router
│       ├── app/
│       │   ├── incident/[id]/page.tsx
│       │   └── observability/page.tsx
│       └── components/
├── services/
│   └── mock-cluster/        # Python FastAPI
│       ├── api/
│       ├── worker/
│       ├── db-proxy/
│       └── auth/
├── mcp/
│   ├── logs/
│   ├── metrics/
│   ├── traces/
│   └── runbook/
├── docs/
│   └── specs/
│       └── 2026-05-21-argus-design.md   # this file
├── vercel.ts
└── package.json
```
