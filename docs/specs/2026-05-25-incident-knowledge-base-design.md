# Incident Knowledge Base — Design

**Status:** draft
**Date:** 2026-05-25
**Author:** Aditya Rawat
**Predecessor:** [`2026-05-21-argus-design.md`](./2026-05-21-argus-design.md)

---

## 1. Goal

Give Argus persistent memory of past incidents. When the agent investigates a
new incident, it should be able to retrieve relevant prior cases — both by
semantic similarity (symptoms, root cause) and by graph relations (shared
service, shared root cause category, temporal adjacency).

After an incident concludes, its final report is automatically ingested into
the knowledge base so the agent gets stronger with every run.

The judges (and operators) see a visual case graph rendered alongside the
final report, making the "agent learns from history" claim demonstrable.

## 2. Non-goals

- Multi-tenant production isolation. Single `group_id="argus_incidents"` for
  now. Multi-tenancy is a later layer.
- Manual case authoring UI. Cases arrive only via the post-incident ingest
  path (auto on resolved, manual override possible).
- Long-form historical analytics. The KB is for retrieval-during-investigation,
  not BI dashboards.
- Replacing the existing `read_runbook` MCP tool. Runbooks are
  human-authored remediation guides. The KB is agent-authored case history.
  Both coexist.

## 3. Architecture overview

```
┌────────────────────────────────────────────────────────────────────┐
│                        apps/orchestrator (Node)                    │
│                                                                    │
│   conductor ─► MCP pool ─► search_logs, query_metrics, ...        │
│        │           └────► read_incident_kb  ◄── new tool          │
│        │                                                           │
│        └── on incident_done (resolved) ───► POST /admin/ingest    │
│                                                                    │
└────────────────────────────────────┬───────────────────────────────┘
                                     │ HTTP
                                     ▼
┌────────────────────────────────────────────────────────────────────┐
│              services/incident-kb (Python + uv)                    │
│                                                                    │
│   graphiti-mcp-server         :7300/mcp                            │
│   admin API (FastAPI)         :7301  /admin/ingest, /admin/reset   │
│                                                                    │
│   Graphiti core ─► extract entities (Gemini 2.5 Flash)            │
│                 ─► embed (sentence-transformers, local)            │
│                 ─► write to Neo4j                                  │
│                                                                    │
└────────────────────────────────────┬───────────────────────────────┘
                                     │ bolt://
                                     ▼
                          ┌─────────────────────┐
                          │  Neo4j Community     │
                          │  :7474 (Browser)     │
                          │  :7687 (Bolt)        │
                          └─────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│                          apps/web (Next.js)                        │
│                                                                    │
│   <FinalReport>                                                   │
│     ├── existing markdown report                                  │
│     └── <CaseGraph incidentId={id} />  ◄── new component          │
│           ├── inline React Flow render                            │
│           └── fullscreen modal toggle (⛶)                          │
│   GET /incident/:id/case-graph (new orchestrator endpoint)        │
└────────────────────────────────────────────────────────────────────┘
```

## 4. Stack — what and why

| Concern | Choice | Rationale |
|---|---|---|
| Graph storage | **Neo4j Community Edition (Docker)** | Free forever, Bolt protocol via official Python driver, Neo4j Browser is a free demo-grade graph visualizer for backup, Graphiti supports it natively |
| KB engine | **Graphiti OSS (Apache 2)** | Bi-temporal knowledge graph, hybrid retrieval (semantic + BM25 + graph traversal) in one call, custom Pydantic entity ontologies, official MCP server, supports OpenAI-compat LLM providers |
| Agent integration | **graphiti-mcp-server over HTTP/MCP** | Argus already uses MCP pool for `search_logs` etc. KB plugs in as another MCP server. Zero new transport plumbing in the orchestrator. |
| LLM for entity extraction | **Gemini 2.5 Flash (free tier)** | Native `responseSchema` enforcement, generous free tier (15 RPM / 1500 RPD / 1M TPD), officially listed Graphiti provider |
| Embeddings | **`sentence-transformers/all-MiniLM-L6-v2` (local)** | Free, offline, no rate limit, ~22 MB, 384-dim, plenty for hundreds of incidents |
| Agent reasoning | **TFY Gateway (Claude + Nemotron)** unchanged | Existing dual-cognition stack stays as-is. Graphiti has its own internal LLM separate from the agent's reasoning calls. |
| Frontend viz | **React Flow** | Next.js-native, beautiful defaults, easy OKLCH theming, fits 10–100 nodes (our case-graph scale), inline + fullscreen modes from same component |

## 5. Components

### 5.1 `services/incident-kb` (new Python service)

Mirrors `services/mock-cluster` shape. Owns Graphiti core, the official
`graphiti-mcp-server`, and a small FastAPI admin layer.

**Responsibilities:**
- Expose MCP tool `read_incident_kb(query)` for the agent
- Expose admin HTTP for orchestrator-driven ingest + reset
- Hold the entity ontology (Pydantic models)
- Connect to Neo4j and the LLM/embedding providers

**Layout:**
```
services/incident-kb/
  pyproject.toml
  src/argus_kb/
    __init__.py
    main.py             # entrypoint: starts MCP server + admin API
    ontology.py         # Pydantic entity models
    ingest.py           # build episode from incident bundle
    config.py           # env var loading
  tests/
```

**Dependencies (uv-managed):**
```
graphiti-core
google-genai           # Gemini SDK
sentence-transformers  # local embeddings
fastapi
uvicorn
```

### 5.2 Entity ontology

Custom entity types passed to Graphiti's extraction so the graph has
queryable typed nodes instead of free-form entities:

```python
from pydantic import Field
from graphiti_core.nodes import EntityModel
from graphiti_core.utils import EntityText

class IncidentEntity(EntityModel):
    incident_id: EntityText = Field(description="Unique incident id (e.g. worker-oom-mpk90sdf)")
    title: EntityText      = Field(description="Short title")
    severity: EntityText   = Field(description="sev1 | sev2 | sev3")
    failed_over: EntityText = Field(description="'true' if a primary failover occurred")
    resolved_at: EntityText = Field(description="ISO-8601 resolution timestamp")

class ServiceEntity(EntityModel):
    name: EntityText = Field(description="Service name: worker | db_proxy | auth | gateway | api")

class RootCauseEntity(EntityModel):
    category: EntityText = Field(description="memleak | slow_query | cpu_saturation | config_drift | auth_failure | network_partition")
    summary: EntityText  = Field(description="One-sentence root cause")

class RemediationEntity(EntityModel):
    action: EntityText = Field(description="restart | scale | config_change | rollback | failover | other")
    target: EntityText = Field(description="Service affected")
```

Graphiti infers edges automatically. Expected edge types: `INVOLVES`,
`CAUSED_BY`, `REMEDIATED_BY`, plus Graphiti's bi-temporal `PRECEDED_BY`
between incidents.

### 5.3 Ingestion pipeline

**Triggered by orchestrator** when an incident reaches a terminal state.

```ts
// orchestrator: on incident_done
const status = computeStatus(entry);
if (status === "resolved") {
  await ingestToKB(buildIncidentBundle(entry));
} else if (status === "halted") {
  // Skipped — surface "not saved" hint in final report instead.
}
```

**Bundle shape sent to `POST /admin/ingest`:**
```ts
{
  incident_id: string,
  title: string,           // scenario title or "Incident <id>"
  report_md: string,       // final markdown report
  scenario: string | null, // "worker-oom" | "db-saturation" | null
  failed_over: boolean,
  severity: "sev1"|"sev2"|"sev3",  // derived from scenario or default sev2
  resolved_at: string,     // ISO
  services_touched: string[],   // extracted from tool log (which services were probed)
  tool_log_digest: string  // compact summary of which tools were called and what they returned
}
```

The Python ingest endpoint converts this into a Graphiti **episode**. The
report markdown plus the tool log digest become the episode body; the
typed metadata (severity, failed_over, services, scenario) get added as
structured properties.

Graphiti runs entity extraction asynchronously via its built-in queue. The
ingest endpoint returns immediately with `{ job_id, status: "queued" }`.
Orchestrator emits SSE event `kb_ingest_queued`.

For v1, ingestion is **fire-and-forget**. The orchestrator does not poll for
completion. The `kb_ingest_complete` event is deferred until v2 (requires
either a Graphiti webhook back to the orchestrator or an orchestrator-side
polling worker — both add complexity not needed for the v1 demo).

**Severity derivation** (since the agent does not emit it today): map
scenario id to severity in a fixed table.
- `worker-oom` → `sev2`
- `db-saturation` → `sev1`
- otherwise → `sev2` (default)
Multi-tenant configurability deferred.

**`services_touched` derivation**: the union of distinct `service`
parameter values appearing in tool-call args across all steps of the
incident, normalized to the controlled service vocabulary (worker,
db_proxy, auth, gateway, api).

### 5.4 Retrieval pipeline

**Two retrieval entry points:**

1. **Agent-driven during investigation** — `read_incident_kb` MCP tool. The
   agent calls it like any other tool. Returns top-N related incidents
   with relation paths.

2. **UI-driven at incident close** — `GET /incident/:id/case-graph`
   returns the graph subset that informed (or could inform) this
   incident's investigation, formatted for React Flow.

**Both use Graphiti's hybrid search:**
- Semantic embedding similarity
- BM25 keyword (Graphiti's built-in)
- Graph traversal from matched nodes (1–2 hops along typed edges)
- Cross-encoder rerank not configured in v1 (semantic + graph hops is
  enough); revisit if results feel noisy

### 5.5 New MCP tool — `read_incident_kb`

Exposed to the agent through `graphiti-mcp-server`. Tool signature:

```
read_incident_kb(query: string, max_results?: int = 5) -> {
  incidents: [
    {
      incident_id: string,
      title: string,
      relevance: float,
      relation_path: string,    // e.g. "via service:worker (1 hop)" or "semantic match"
      summary: string,          // short snippet
      url: string               // /incident/<id>
    }
  ],
  graph_context: {
    nodes: [...],
    edges: [...]
  }
}
```

The conductor exposes this as a new `AgentAction` alongside `search_logs`
etc. System prompt updated to describe when to call it (early in the
investigation, when symptoms are clear enough to query).

### 5.6 Case-graph rendering

**Orchestrator endpoint:**
```
GET /incident/:id/case-graph
→ {
    nodes: Array<{ id, type: "incident"|"service"|"root_cause"|"remediation", label, meta }>,
    edges: Array<{ source, target, type, label }>,
    focus_id: string  // the current incident node
  }
```

Orchestrator calls the KB admin API at `/case-graph/:incident_id`. KB
service:
1. Looks up the current incident's node in Neo4j
2. Walks edges 2 hops out
3. Returns the subgraph in the shape above

**React Flow integration:**

`apps/web/components/case-graph.tsx`

- Inline render inside `<FinalReport>`: ~360px tall
- Fullscreen toggle (`⛶`) opens a portal modal covering 90vw × 90vh
- Node types styled per role:
  - `incident` → primary color, current = larger + ring
  - `service` → muted, square-ish
  - `root_cause` → warn color
  - `remediation` → success color
- Edges labeled with relation type ("involves", "caused by", "preceded by")
- Click a non-focus incident node → opens `/incident/<id>` in new tab
- Layout: dagre top-down on initial render, drag for manual repositioning

### 5.7 Reset path

`POST /admin/kb/reset` on orchestrator → proxies to KB service →
`graphiti.clear_graph(group_id="argus_incidents")` → returns `{ok: true}`.

**Two surfaces:**
- CLI: `pnpm reset-kb` runs `scripts/reset-kb.ts`, POSTs to orchestrator
- UI: chaos-panel button "Reset KB" with confirmation dialog
  ("Wipe all stored incidents. Continue?")

Confirmation dialog is **required** for UI path (destructive op).

### 5.8 Seeding

`scripts/seed-kb.ts` pre-populates the KB with 10–15 synthetic past
incidents covering the scenario space (worker-oom, db-saturation,
auth-flap, network-partition, config-drift, etc.). Each seed entry:

```ts
{
  incident_id, title, report_md, scenario, services_touched,
  resolved_at: <staggered dates across the last 60 days>,
  severity, failed_over
}
```

POSTs each through `/admin/ingest`. Used before demos so the case graph
isn't empty on the first live incident.

## 6. Configuration

`.env.local` additions:

```bash
# Neo4j (local Docker)
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=devpass

# Graphiti's LLM provider (entity extraction)
GEMINI_API_KEY=...
GRAPHITI_LLM_PROVIDER=gemini
GRAPHITI_LLM_MODEL=gemini-2.5-flash

# Graphiti's embedding provider (local, no key needed)
GRAPHITI_EMBEDDER_PROVIDER=sentence_transformers
GRAPHITI_EMBEDDER_MODEL=sentence-transformers/all-MiniLM-L6-v2

# Tenancy
GRAPHITI_GROUP_ID=argus_incidents

# Service URLs (used by orchestrator)
INCIDENT_KB_MCP_URL=http://localhost:7300/mcp
INCIDENT_KB_ADMIN_URL=http://localhost:7301
```

`docker-compose.yml` (new file at repo root):

```yaml
services:
  neo4j:
    image: neo4j:5-community
    container_name: argus-neo4j
    ports:
      - "7474:7474"
      - "7687:7687"
    environment:
      NEO4J_AUTH: neo4j/devpass
      NEO4J_PLUGINS: '["apoc"]'
      NEO4J_dbms_memory_heap_max__size: 1G
    volumes:
      - neo4j-data:/data
volumes:
  neo4j-data:
```

Root `package.json` script additions:

```json
{
  "scripts": {
    "dev:neo4j": "docker compose up -d neo4j",
    "dev:kb": "uv --directory services/incident-kb run argus-kb",
    "reset-kb": "tsx scripts/reset-kb.ts",
    "seed-kb": "tsx scripts/seed-kb.ts"
  }
}
```

## 7. API surface — summary

### Orchestrator (new endpoints)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/incident/:id/case-graph` | Subgraph for React Flow render in final report |
| `POST` | `/admin/kb/reset` | Wipe + re-seed KB |
| `POST` | `/admin/kb/ingest` (internal) | Manual override "Save to KB" button |

### KB service (new)

| Method | Path | Purpose |
|---|---|---|
| MCP | `:7300/mcp/read_incident_kb` | Agent retrieval tool |
| `POST` | `:7301/admin/ingest` | Receive incident bundle, queue Graphiti ingest |
| `POST` | `:7301/admin/reset` | Clear group_id graph |
| `GET` | `:7301/case-graph/:incident_id` | Return subgraph |
| `GET` | `:7301/health` | Liveness |

### SSE events (new)

| Event | Payload | When |
|---|---|---|
| `kb_lookup_started` | `{step, query}` | Agent invoked `read_incident_kb` |
| `kb_lookup_result` | `{step, hit_count, top_ids[]}` | Tool result returned |
| `kb_ingest_queued` | `{job_id}` | Orchestrator submitted bundle |
| `kb_ingest_complete` *(v2)* | `{job_id, node_count, edge_count}` | KB confirmed ingestion finished — deferred until webhook or polling added |

## 8. Frontend additions

### 8.1 `apps/web/components/case-graph.tsx` (new)

React Flow embed. Props: `incidentId`. On mount, fetches
`/incident/:id/case-graph`, transforms response into React Flow's
`nodes` + `edges` shape, renders with dagre layout.

Two render modes via `mode` prop or internal state:
- `inline` — 360px tall, fixed in final report
- `fullscreen` — 90vw × 90vh modal via React portal

### 8.2 `apps/web/components/final-report.tsx` (modified)

After the existing markdown render, append:

```tsx
{status === "resolved" || status === "halted" ? (
  <section className="border-t border-[var(--color-border)] pt-6">
    <header className="flex items-baseline justify-between">
      <h3>prior cases consulted</h3>
      <button onClick={openFullscreen}><FullscreenIcon /></button>
    </header>
    <CaseGraph incidentId={id} />
    <RelatedCasesList incidentId={id} />
  </section>
) : null}
```

`<RelatedCasesList>` derives a linked list from the same payload, links
each to `/incident/<id>`.

### 8.3 `apps/web/components/chaos-panel.tsx` (modified)

Add a third panel button (returning the 3-column grid we had before
removing the gateway button) — labeled "Reset KB" with a danger style
and a confirm dialog. On confirm, POST `/admin/kb/reset`.

### 8.4 `apps/web/lib/types.ts` (modified)

Extend `EventName` union: add `"kb_lookup_started" | "kb_lookup_result" |
"kb_ingest_queued" | "kb_ingest_complete"`.

### 8.5 Timeline + reasoning pane

Both pick up the new event types via existing routing; just add color +
label entries in `timeline.tsx`'s `COLOR` and `LABEL` records.

## 9. Conductor changes

### 9.1 Action enum

`apps/orchestrator/src/types.ts`:

```ts
export type AgentAction =
  | "search_logs"
  | "query_metrics"
  | "query_traces"
  | "read_runbook"
  | "read_incident_kb"  // new
  | "report";
```

### 9.2 System prompt update

`prompts.ts` gets a new section describing when to call
`read_incident_kb`:

> Use `read_incident_kb(query)` early in the investigation, after you've
> formed an initial hypothesis from the alert. The KB returns past
> incidents that share services, root causes, or symptoms with your
> current case. Treat returned cases as evidence, not ground truth —
> verify against live signals before adopting a remediation.

### 9.3 MCP pool

`mcp-pool.ts` gets a new server registration pointing at
`INCIDENT_KB_MCP_URL`. The pool already supports multiple MCP servers, so
this is a config addition.

### 9.4 Post-incident ingestion

`server.ts` listens for the `incident_done` event (already emitted by
the conductor) and, if status === "resolved", calls
`POST $INCIDENT_KB_ADMIN_URL/admin/ingest` with the bundle.

## 10. Demo flow

1. Operator starts orchestrator + web + Neo4j + KB service (`pnpm dev:all`).
2. Operator runs `pnpm seed-kb` once — KB now has 12 historic incidents.
3. Operator triggers a new incident (e.g. worker-oom scenario).
4. Conductor starts the dual-cognition loop. Around step 2, agent
   calls `read_incident_kb("worker memory pressure cascading 503s")`.
5. UI shows new event in timeline: `kb_lookup` bar; reasoning pane shows
   the returned incident summaries in step body.
6. Agent finishes investigation, emits `report`.
7. Final report panel renders. Case graph fades in below the markdown —
   current incident in the center, 3 semantic neighbors + 4 graph-hop
   neighbors. Operator clicks ⛶ to fullscreen for the demo shot.
8. Orchestrator auto-ingests the resolved incident — the next run's case
   graph will include today's incident as a node.

## 11. Risks + open questions

| Risk | Mitigation |
|---|---|
| Graphiti's entity extraction silently fails on a particular LLM | Gemini chosen specifically for schema enforcement; smoke test in v1 implementation by checking node count after seed runs |
| Local sentence-transformers slow on first load (model download ~80 MB) | Pre-warm on KB service startup, log readiness; document in README |
| Neo4j Docker container needs to be running before KB service starts | KB service retries Neo4j connection with exponential backoff for 30s; orchestrator surfaces clear error if KB MCP is unreachable |
| KB ingestion latency makes "just-ingested" incidents not yet searchable in same demo session | Acceptable — case graph for the just-finished incident is built from the LIVE retrieval the agent did, not from re-querying after ingest. Newly stored incidents become available on the next incident's queries. |
| React Flow performance with 100+ nodes | Initial render only fetches 2-hop subgraph, capped at ~30 nodes. Full case library never rendered at once. |
| Agent calls KB on every step, burning Gemini quota | KB tool is a "search" call, doesn't trigger Gemini. Only ingestion uses Gemini. System prompt also nudges agent to call KB early once, not repeatedly. |
| Pollution from low-quality reports | `status==="halted"` skipped from auto-ingest. Manual override exists; user-driven curation when needed. |

## 12. Out of scope (deferred)

- Multi-tenant `group_id` per organization
- Manual case authoring/editing in the web UI
- Tag taxonomy editor — categories live in source for v1
- Cross-encoder reranking on retrieval — semantic + graph-hop is good
  enough; revisit if precision feels off
- Decay / archival of old cases (keep all forever in v1)
- Embedding model swap — locked to `all-MiniLM-L6-v2` for v1; switching
  later requires re-embedding all stored cases

## 13. Acceptance criteria

A v1 implementation is done when:

1. Docker compose brings up Neo4j cleanly via `pnpm dev:neo4j`.
2. `pnpm dev:kb` starts the Python KB service; `/health` returns 200.
3. `pnpm seed-kb` populates 10+ incidents; Neo4j Browser shows the graph.
4. A new incident causes the agent to call `read_incident_kb` and the
   timeline shows the lookup events.
5. The final report panel renders the case graph inline; clicking ⛶ opens
   the fullscreen modal.
6. On `incident_done` (resolved), the orchestrator submits the bundle
   automatically; `kb_ingest_queued` fires; the next incident's
   `read_incident_kb` query can retrieve the just-ingested incident
   (verifiable via Neo4j Browser within ~30 s of submission).
7. Halted incidents do NOT auto-ingest; the final report shows the
   "not saved" hint with a manual override button.
8. `Reset KB` button + CLI both wipe the graph and the UI reflects the
   empty state.

## 14. Implementation order (high level)

1. Docker compose for Neo4j + verify Browser access
2. Python KB service skeleton (`/health`, Graphiti init, Neo4j connection)
3. Entity ontology + ingestion endpoint
4. Seed script + verify graph in Neo4j Browser
5. graphiti-mcp-server wired up + added to orchestrator MCP pool
6. New AgentAction + system prompt update + agent tool integration
7. `GET /incident/:id/case-graph` orchestrator endpoint
8. `<CaseGraph>` React Flow component, inline mode
9. Fullscreen modal mode
10. Auto-ingest hook on `incident_done`
11. Manual override + halted-incident hint in final report
12. Reset KB (CLI + UI)
13. Demo polish + new event styling in timeline

A separate implementation plan (`docs/plans/...`) will break each of these
into bite-sized tasks.
