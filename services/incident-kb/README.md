# argus-kb — Incident Knowledge Base

Graphiti-backed knowledge graph for past-incident retrieval and visualization.

## Endpoints

- `:7300/mcp` — MCP server exposing `read_incident_kb(query, max_results?)`
- `:7301/health` — liveness probe
- `:7301/admin/ingest` — POST incident bundle (auto-called by orchestrator on resolved incidents)
- `:7301/admin/reset` — wipe the `argus_incidents` group
- `:7301/case-graph/:incident_id` — 2-hop subgraph in React Flow shape

## Stack

- **Neo4j 5 Community** (Docker) — graph storage
- **Graphiti OSS** — bi-temporal knowledge graph engine
- **Gemini 2.5 Flash** — entity extraction + reranking (free tier)
- **sentence-transformers/all-MiniLM-L6-v2** — local embeddings (no quota)

All three Graphiti clients are overridden from the OpenAI defaults; see
`src/argus_kb/graph.py`.

## Run

1. Start Neo4j: `pnpm dev:neo4j` (from repo root)
2. Set `GEMINI_API_KEY` in `.env.local` (free tier at https://aistudio.google.com/apikey)
3. Start KB: `pnpm dev:kb`
4. Seed: `pnpm seed-kb`

First boot downloads the `all-MiniLM-L6-v2` embedding model (~80 MB). Subsequent boots are fast.

## Gemini free-tier quota

The free tier caps `generate_content` at a per-project daily budget. A single
`add_episode` fires ~10 sequential LLM calls, so:

- A global token-bucket limiter (`graph.py`, 8 calls / 65 s) keeps ingestion
  under the per-minute cap.
- `seed-kb` spaces incidents 5 s apart and `ingest.py` retries with backoff.
- The **daily** cap still applies. Seeding all 12 incidents costs ~120 calls;
  if the daily budget is already spent, seeding fails until it resets
  (midnight Pacific). Use a paid key or wait for reset.

## Reset

- CLI: `pnpm reset-kb`
- UI: Reset KB button in the chaos panel on any incident page
