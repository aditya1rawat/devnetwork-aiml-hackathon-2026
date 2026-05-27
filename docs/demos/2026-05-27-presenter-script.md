# Argus — Presenter Script

A spoken-word runbook for the live demo. `[DO]` = what you click. `[SAY]` = what you say. Target length ~5–6 min. Trim acts 4–5 if you're short on time.

> Three tabs open before you start: **Ridgeline** (`http://localhost:3001`), **Argus** (`http://localhost:3000/dashboard`), and **Neo4j Browser** (`http://localhost:7474`, run `MATCH (n)-[r]->(m) RETURN n, r, m` so the graph **with edges** is already rendered for Act 4.5). KB pre-seeded. Don't seed live.

---

## Cold open (15s)

`[SAY]` "Every team building agents hits the same wall in production: the model blinks, and the agent dies. The standard answer is a retry loop — start over, lose all your reasoning. We asked a different question. HA web servers run on N machines. Why don't agents? This is Argus — a dual-cognition SRE agent that investigates incidents, survives the chaos it's responding to, and learns from every case it closes."

---

## Act 1 — The fault starts inside the product (60s)

`[DO]` On the **Ridgeline** tab, land on the **Overview** dashboard. Pause a beat — pipelines healthy, throughput green.

`[SAY]` "This is Ridgeline, a data-pipeline platform. It's the product your on-call engineer actually lives in. Everything's healthy."

`[DO]` Click **Pipelines** in the nav (`/jobs`). Let it sit ~6 seconds. worker-3's heap bar climbs, goes WARN, then OOM. Queue backs up.

`[SAY]` "A batch worker starts leaking memory. Heap climbs, the job queue backs up… and there it goes — OOM."

`[DO]` Bottom-right **Argus launcher** flares red. Click it.

`[SAY]` "Argus detected the fault from inside the product. No dashboard to go hunt, no alert to triage — it's right here."

`[DO]` Toast holds on "generating…" for ~1s, then streams in the diagnosis + suspected root cause.

`[SAY]` "And before I do anything, it's already streaming a first-pass diagnosis — that's a live Claude Haiku call through the gateway, not a canned string."

> If a judge asks: the in-product triage is Claude Haiku 4.5 (fast, cheap); the full investigation runs the dual-cognition Claude + Nemotron loop. If you trigger faults on multiple surfaces, each one stacks as its own Argus alert.

---

## Act 2 — Hand off to the full investigation (45s)

`[DO]` Click **"Open investigation →"**. Lands on the Argus investigation view (`:3000`).

`[SAY]` "One click opens the full autonomous investigation. The operator never left their product context — detection and response start from the same screen."

`[DO]` Point at the timeline as steps stream in.

`[SAY]` "Argus is now pulling logs, metrics, traces, and runbooks through MCP servers, building a timeline as it reasons."

---

## Act 3 — Dual cognition + survive the chaos (90s) — THE HERO MOMENT

`[SAY]` "Here's the part that matters. Argus isn't running one model — it's running two, in lockstep. Claude is the primary; Nemotron, on Crusoe, is a warm shadow executing the same investigation."

`[DO]` Open the chaos panel. **Kill Claude** mid-investigation.

`[SAY]` "Watch what happens when I kill the primary mid-thought."

`[DO]` Failover banner appears; investigation continues without restarting.

`[SAY]` "No retry loop. No cold start. The shadow was already mid-investigation, so it just takes over — zero context lost. That's active-active for agents."

`[DO]` (Optional) **Sever the TrueFoundry Gateway.** Direct-mode banner kicks in.

`[SAY]` "And if the gateway itself fails, Argus falls back to calling providers directly. It routes around its own dependencies while it's working."

`[SAY]` "One more thing: when the two cognitions disagree, that disagreement is itself a hallucination signal. Redundancy gives us a built-in confidence check for free."

---

## Act 4 — It learns from its own history (60s)

`[DO]` Scroll the timeline to the `kb?` → `kb✓` step. Open the reasoning pane there.

`[SAY]` "Mid-investigation, Argus queried its own knowledge base — past incidents that share this service, symptom, or root cause. It's not starting cold; it's standing on every postmortem it's ever written."

`[DO]` Let it resolve. Scroll to the final report's **case graph**. Click **⛶ fullscreen**.

`[SAY]` "Here's the bi-temporal knowledge graph. This incident at the center, prior worker-memory cases as neighbors, the shared service node, the root-cause node. And when this incident resolves, it gets ingested right back in — so the next investigation is smarter. Resolve, ingest, retrieve, with no human curating anything."

---

## Act 4.5 — Under the hood: the graph itself (10s)

`[DO]` Flip to the **Neo4j Browser** tab (`localhost:7474`) showing `MATCH (n)-[r]->(m) RETURN n, r, m` — nodes **and** the typed edges between them. Hold it ~10s. Let the connected graph and the left-hand schema panel read. (`MATCH (n) RETURN n` shows nodes only — return `r` to draw edges, or use the "Connect result nodes" toggle.)

`[SAY]` "And this is the store underneath it — Neo4j, built with Graphiti. It's a real bi-temporal graph: incidents, services, root causes, and remediations as typed nodes, linked by typed relationships, every edge stamped with when it was valid. That panel on the left is the live schema — Incident, Service, Remediation nodes; RELATES_TO and MENTIONS edges; valid_at / invalid_at timestamps. This isn't a vector blob — it's queryable structure that compounds with every incident Argus closes."

> Numbers on screen for reference: ~48 nodes, ~118 relationships (Entity, Episodic, Incident, Remediation, Service node types). Don't dwell — it's a 10-second "this is real" beat, then move on.

---

## Act 5 — Breadth: every product surface is wired (45s)

`[DO]` Switch to the **Argus dashboard** (`/dashboard`). Show the ops board — six observed surfaces.

`[SAY]` "This wasn't one scripted demo. Six scenarios across four services, each with its own Ridgeline product surface."

`[DO]` Click **inspect** on a different row — e.g. **Deploys** (config drift) or **Connections** (upstream timeouts). It opens that Ridgeline surface already in its error state with the Argus alert raised.

`[SAY]` "A bad config deploy. Upstream database timeouts. A sign-in 503 storm. Same pattern every time — the fault surfaces inside the product, and Argus is one click from a full investigation."

---

## Close (20s)

`[SAY]` "So that's Argus. Dual cognition so the agent survives its own failures. A knowledge graph so it gets smarter with every incident. And product-embedded triggers so the operator never leaves the screen they're already staring at. Redundancy for agents isn't overhead — it's table stakes. Thank you."

---

## If something breaks (recovery lines)

- **Triage toast slow/errors:** "That's a live model call — it'll catch up. The full investigation is where the real work happens." Click through.
- **Agent doesn't call the KB this run:** open a previously-resolved worker-oom incident from `/incidents` — its case graph is already rendered.
- **Fault didn't fire on the surface:** Ridgeline timers are page-scoped; reload the page and stay on it, or use the ops board **inspect** link (boots straight into the error state).
- **Everything's wedged:** open any surface with `?fault=1` (e.g. `localhost:3001/jobs?fault=1`) — instant pre-triggered state.

## Surface → scenario cheat sheet

| Nav / inspect | Route | Scenario | What you'll see |
|---------------|-------|----------|-----------------|
| Pipelines | `/jobs` | worker-oom | heap climbs → OOM (~6s) |
| Queries | `/query` | db-saturation | run query → times out (~2.5s) |
| Sign In | `/login` | auth-5xx | submit → 503 (~700ms) |
| Dashboard | `/app` | api-brownout | panels stall, p99 climbs |
| Connections | `/connections` | db-timeout | db rows climb to TIMEOUT |
| Deploys | `/deploys` | api-config-drift | rev-47 goes live → error spike |
