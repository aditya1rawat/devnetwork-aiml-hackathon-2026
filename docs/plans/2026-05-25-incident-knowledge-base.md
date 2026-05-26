# Incident Knowledge Base Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Argus persistent memory of past incidents via a Graphiti+Neo4j knowledge graph, retrievable mid-investigation through an MCP tool and visualized as a case graph in the final report.

**Architecture:** A new Python service (`services/incident-kb`) wraps Graphiti core. Neo4j runs in Docker. The orchestrator gains a `read_incident_kb` MCP tool (HTTP transport to graphiti-mcp-server), auto-ingests resolved incidents on `incident_done`, and exposes `GET /incident/:id/case-graph` for a React Flow embed inside the final report. Frontend additions: case graph component (inline + fullscreen), related cases list, Reset KB chaos button, four new SSE event types.

**Tech Stack:** Neo4j 5 Community, Graphiti OSS (Apache 2), Gemini 2.5 Flash (entity extraction), `sentence-transformers/all-MiniLM-L6-v2` (local embeddings), FastAPI + uv (Python), Hono + MCP HTTP transport (orchestrator), React Flow + dagre (web).

**Spec reference:** [`docs/specs/2026-05-25-incident-knowledge-base-design.md`](../specs/2026-05-25-incident-knowledge-base-design.md)

---

## File Structure

### New files

| Path | Responsibility |
|---|---|
| `docker-compose.yml` | Neo4j 5 Community + APOC, single service, named volume |
| `services/incident-kb/pyproject.toml` | uv project; deps: graphiti-core, google-genai, sentence-transformers, fastapi, uvicorn, neo4j |
| `services/incident-kb/src/argus_kb/__init__.py` | Package marker |
| `services/incident-kb/src/argus_kb/config.py` | Env loading via pydantic-settings |
| `services/incident-kb/src/argus_kb/ontology.py` | Pydantic entity types passed to Graphiti |
| `services/incident-kb/src/argus_kb/graph.py` | Graphiti singleton + Neo4j connect/retry |
| `services/incident-kb/src/argus_kb/ingest.py` | Bundle → Graphiti episode |
| `services/incident-kb/src/argus_kb/case_graph.py` | Subgraph fetch + React Flow shape transform |
| `services/incident-kb/src/argus_kb/admin_api.py` | FastAPI app: /health, /admin/ingest, /admin/reset, /case-graph/:id |
| `services/incident-kb/src/argus_kb/mcp_server.py` | MCP server exposing `read_incident_kb` tool over HTTP |
| `services/incident-kb/src/argus_kb/main.py` | Entrypoint: spawn admin API (:7301) + MCP server (:7300) in same process |
| `services/incident-kb/tests/__init__.py` | Empty |
| `services/incident-kb/tests/test_ontology.py` | Pydantic model shape |
| `services/incident-kb/tests/test_ingest_bundle.py` | Bundle validation + episode shape |
| `services/incident-kb/tests/test_case_graph_shape.py` | Neo4j subgraph → React Flow transform |
| `scripts/seed-kb.ts` | POST 12 synthetic incidents to admin API |
| `scripts/reset-kb.ts` | POST to orchestrator's reset endpoint |
| `apps/orchestrator/src/incident-kb-client.ts` | Typed HTTP client for KB admin API |
| `apps/orchestrator/src/mcp-http.ts` | HTTP MCP transport wrapper for graphiti-mcp-server |
| `apps/orchestrator/test/incident-kb-client.test.ts` | Mock-fetch tests for client |
| `apps/web/components/case-graph.tsx` | React Flow embed, inline + fullscreen modes |
| `apps/web/components/related-cases-list.tsx` | Linked list of prior cases |

### Modified files

| Path | Change |
|---|---|
| `package.json` | New scripts: `dev:neo4j`, `dev:kb`, `seed-kb`, `reset-kb`, `dev:all` |
| `.env.local` | New env vars: Neo4j, Gemini, Graphiti, KB URLs |
| `apps/orchestrator/src/types.ts` | Add `"read_incident_kb"` to `AgentAction`; extend `ConductorEvent.type` union with kb events |
| `apps/orchestrator/src/prompts.ts` | Append `read_incident_kb` usage section + tool to tool list |
| `apps/orchestrator/src/conductor.ts` | Include `"read_incident_kb"` in `validActions`; emit `kb_lookup_started` / `kb_lookup_result` around its invocation |
| `apps/orchestrator/src/mcp-stdio.ts` | No change (KB uses HTTP transport, not stdio) |
| `apps/orchestrator/src/mcp-pool.ts` | Accept multiple transport callers; register KB tool |
| `apps/orchestrator/src/server.ts` | New endpoints: `GET /incident/:id/case-graph`, `POST /admin/kb/reset`, `POST /admin/kb/ingest`; auto-ingest hook in `spawnIncident` emit handler |
| `apps/orchestrator/src/index.ts` | Wire `IncidentKbClient` + add `read_incident_kb` to tools map |
| `apps/web/lib/types.ts` | Extend `EventName`: `kb_lookup_started`, `kb_lookup_result`, `kb_ingest_queued` |
| `apps/web/lib/sse.ts` | Add three new event names to `handlers` array |
| `apps/web/lib/api.ts` | Add `getCaseGraph`, `resetKB`, update `OrchestratorState` typing for KB |
| `apps/web/components/final-report.tsx` | Append `<CaseGraph>` + `<RelatedCasesList>` after markdown render when status is terminal |
| `apps/web/components/chaos-panel.tsx` | Add third button "Reset KB" with confirm dialog, switch grid to 3 columns |
| `apps/web/components/timeline.tsx` | Add `COLOR` + `LABEL` entries for new event names |
| `apps/web/package.json` | Add `reactflow` and `dagre` deps |

---

## Pre-flight: graphiti-core API verification

Spec section 5.2 names `EntityModel` + `EntityText` imports. The published `graphiti-core` API uses plain Pydantic models passed via the `entity_types` parameter. **Before writing `ontology.py` (Task 4), verify the library's current API** by running:

```bash
uv --directory services/incident-kb run python -c "
import graphiti_core
from graphiti_core import Graphiti
help(Graphiti.add_episode)
"
```

If the spec's import paths don't exist in `graphiti-core>=0.3.0`, adapt to whichever API the installed version exposes (typical pattern: plain `pydantic.BaseModel` subclasses with `Field(description=...)` passed via `entity_types={"Incident": IncidentEntity, ...}` to `add_episode`). Note the adaptation in a one-line comment at the top of `ontology.py`.

---

## Task 1: Docker Compose for Neo4j

**Files:**
- Create: `docker-compose.yml`

- [ ] **Step 1: Write `docker-compose.yml` at repo root**

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

- [ ] **Step 2: Bring up the container**

Run: `docker compose up -d neo4j`
Expected: `Container argus-neo4j  Started`

- [ ] **Step 3: Verify Bolt + Browser**

Run: `curl -s -u neo4j:devpass http://localhost:7474/ | head -c 80`
Expected: JSON response containing `"neo4j_version"`.

Run: `nc -z localhost 7687 && echo BOLT_OK`
Expected: `BOLT_OK`

- [ ] **Step 4: Add root scripts to `package.json`**

Modify `package.json` `"scripts"` block, replacing the existing scripts object with:

```json
"scripts": {
  "dev:web": "pnpm --filter @argus/web dev",
  "dev:orch": "pnpm --filter @argus/orchestrator dev",
  "dev:mcp": "pnpm --filter @argus/mcp dev",
  "dev:cluster": "uv --directory services/mock-cluster run cluster",
  "dev:neo4j": "docker compose up -d neo4j",
  "dev:kb": "uv --directory services/incident-kb run argus-kb",
  "seed-kb": "tsx scripts/seed-kb.ts",
  "reset-kb": "tsx scripts/reset-kb.ts",
  "test": "pnpm -r test",
  "build": "pnpm -r build"
}
```

- [ ] **Step 5: Verify pnpm sees the new scripts**

Run: `pnpm run | grep -E '(dev:neo4j|dev:kb|seed-kb|reset-kb)'`
Expected: All four script names listed.

- [ ] **Step 6: Commit**

```bash
git add docker-compose.yml package.json
git commit -m "kb: add Neo4j docker-compose + root scripts"
```

---

## Task 2: KB service skeleton with /health

**Files:**
- Create: `services/incident-kb/pyproject.toml`
- Create: `services/incident-kb/src/argus_kb/__init__.py`
- Create: `services/incident-kb/src/argus_kb/config.py`
- Create: `services/incident-kb/src/argus_kb/admin_api.py`
- Create: `services/incident-kb/src/argus_kb/main.py`

- [ ] **Step 1: Write `pyproject.toml`**

```toml
[project]
name = "argus-kb"
version = "0.0.1"
requires-python = ">=3.13"
dependencies = [
  "fastapi>=0.115.0",
  "uvicorn[standard]>=0.32.0",
  "pydantic>=2.9.0",
  "pydantic-settings>=2.5.0",
  "httpx>=0.27.0",
  "graphiti-core>=0.3.0",
  "google-genai>=0.3.0",
  "sentence-transformers>=3.0.0",
  "neo4j>=5.20.0",
  "mcp>=1.0.0",
]

[project.optional-dependencies]
dev = ["pytest>=8.3.0", "pytest-asyncio>=0.24.0"]

[project.scripts]
argus-kb = "argus_kb.main:main"

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"
```

- [ ] **Step 2: Write `__init__.py`**

```python
"""argus-kb — incident knowledge graph service."""
```

- [ ] **Step 3: Write `config.py`**

```python
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file="../../.env.local", extra="ignore")

    neo4j_uri: str = "bolt://localhost:7687"
    neo4j_user: str = "neo4j"
    neo4j_password: str = "devpass"

    gemini_api_key: str = ""
    graphiti_llm_provider: str = "gemini"
    graphiti_llm_model: str = "gemini-2.5-flash"
    graphiti_embedder_provider: str = "sentence_transformers"
    graphiti_embedder_model: str = "sentence-transformers/all-MiniLM-L6-v2"
    graphiti_group_id: str = "argus_incidents"

    admin_port: int = 7301
    mcp_port: int = 7300


settings = Settings()
```

- [ ] **Step 4: Write a minimal `admin_api.py`**

```python
from fastapi import FastAPI

app = FastAPI(title="argus-kb-admin")


@app.get("/health")
async def health() -> dict[str, bool]:
    return {"ok": True}
```

- [ ] **Step 5: Write `main.py` (admin only for now)**

```python
import uvicorn

from argus_kb.config import settings


def main() -> None:
    uvicorn.run(
        "argus_kb.admin_api:app",
        host="0.0.0.0",
        port=settings.admin_port,
        log_level="info",
    )


if __name__ == "__main__":
    main()
```

- [ ] **Step 6: Install deps**

Run: `uv --directory services/incident-kb sync --extra dev`
Expected: `Resolved N packages` and no errors. Allow ~2 min on first run (sentence-transformers + torch are large).

- [ ] **Step 7: Boot service**

Run: `uv --directory services/incident-kb run argus-kb &`
Then: `sleep 3 && curl -s http://localhost:7301/health`
Expected: `{"ok":true}`

Stop the service: `pkill -f "argus_kb"` or kill the backgrounded job.

- [ ] **Step 8: Commit**

```bash
git add services/incident-kb/pyproject.toml services/incident-kb/uv.lock services/incident-kb/src/argus_kb/__init__.py services/incident-kb/src/argus_kb/config.py services/incident-kb/src/argus_kb/admin_api.py services/incident-kb/src/argus_kb/main.py
git commit -m "kb: scaffold Python service with /health endpoint"
```

---

## Task 3: .env.local additions + Gemini key check

**Files:**
- Modify: `.env.local`

- [ ] **Step 1: Append KB env block**

Append these lines to `.env.local`:

```bash
# --- Incident Knowledge Base ---
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=devpass

GEMINI_API_KEY=your-gemini-key-here

GRAPHITI_LLM_PROVIDER=gemini
GRAPHITI_LLM_MODEL=gemini-2.5-flash
GRAPHITI_EMBEDDER_PROVIDER=sentence_transformers
GRAPHITI_EMBEDDER_MODEL=sentence-transformers/all-MiniLM-L6-v2
GRAPHITI_GROUP_ID=argus_incidents

INCIDENT_KB_MCP_URL=http://localhost:7300/mcp
INCIDENT_KB_ADMIN_URL=http://localhost:7301
```

- [ ] **Step 2: Verify env vars load**

Run: `uv --directory services/incident-kb run python -c "from argus_kb.config import settings; print(settings.neo4j_uri, settings.graphiti_group_id)"`
Expected: `bolt://localhost:7687 argus_incidents`

- [ ] **Step 3: Manually obtain a Gemini API key**

User-driven step: visit https://aistudio.google.com/apikey, create a free-tier key, replace `your-gemini-key-here` in `.env.local`. Do NOT commit the actual key — `.env.local` is gitignored. Verify gitignore:

Run: `git check-ignore .env.local`
Expected: `.env.local`

- [ ] **Step 4: No commit (env-only change, file is gitignored)**

Skip git commit for this task.

---

## Task 4: Entity ontology

**Files:**
- Create: `services/incident-kb/src/argus_kb/ontology.py`
- Create: `services/incident-kb/tests/__init__.py`
- Create: `services/incident-kb/tests/test_ontology.py`

- [ ] **Step 1: Write `tests/__init__.py` (empty)**

```python
```

- [ ] **Step 2: Write failing test `tests/test_ontology.py`**

```python
from argus_kb.ontology import (
    IncidentEntity,
    ServiceEntity,
    RootCauseEntity,
    RemediationEntity,
    ENTITY_TYPES,
)


def test_incident_entity_required_fields():
    e = IncidentEntity(
        incident_id="worker-oom-abc",
        title="Worker OOM",
        severity="sev2",
        failed_over="false",
        resolved_at="2026-05-25T10:00:00Z",
    )
    assert e.incident_id == "worker-oom-abc"
    assert e.severity == "sev2"


def test_service_entity_minimal():
    e = ServiceEntity(name="worker")
    assert e.name == "worker"


def test_root_cause_entity():
    e = RootCauseEntity(category="memleak", summary="Worker heap leaks 120MB/tick.")
    assert e.category == "memleak"


def test_remediation_entity():
    e = RemediationEntity(action="restart", target="worker")
    assert e.action == "restart"


def test_entity_types_registry():
    assert "Incident" in ENTITY_TYPES
    assert "Service" in ENTITY_TYPES
    assert "RootCause" in ENTITY_TYPES
    assert "Remediation" in ENTITY_TYPES
```

- [ ] **Step 3: Run test, confirm failure**

Run: `uv --directory services/incident-kb run pytest tests/test_ontology.py -v`
Expected: `ModuleNotFoundError: No module named 'argus_kb.ontology'`

- [ ] **Step 4: Write `ontology.py`**

```python
"""Entity ontology for the incident knowledge graph.

If graphiti-core>=0.3.0 exposes EntityModel/EntityText helpers, swap the
BaseModel imports for those — public Graphiti uses plain Pydantic models
passed via entity_types={...} to add_episode().
"""
from pydantic import BaseModel, Field


class IncidentEntity(BaseModel):
    """A single past incident."""

    incident_id: str = Field(description="Unique incident id (e.g. worker-oom-mpk90sdf)")
    title: str = Field(description="Short title")
    severity: str = Field(description="sev1 | sev2 | sev3")
    failed_over: str = Field(description="'true' if a primary failover occurred")
    resolved_at: str = Field(description="ISO-8601 resolution timestamp")


class ServiceEntity(BaseModel):
    """A service in the cluster."""

    name: str = Field(description="Service name: worker | db_proxy | auth | gateway | api")


class RootCauseEntity(BaseModel):
    """A root cause category and summary."""

    category: str = Field(
        description="memleak | slow_query | cpu_saturation | config_drift | auth_failure | network_partition"
    )
    summary: str = Field(description="One-sentence root cause")


class RemediationEntity(BaseModel):
    """A remediation action taken or recommended."""

    action: str = Field(description="restart | scale | config_change | rollback | failover | other")
    target: str = Field(description="Service affected")


ENTITY_TYPES = {
    "Incident": IncidentEntity,
    "Service": ServiceEntity,
    "RootCause": RootCauseEntity,
    "Remediation": RemediationEntity,
}
```

- [ ] **Step 5: Run tests**

Run: `uv --directory services/incident-kb run pytest tests/test_ontology.py -v`
Expected: 5 passed.

- [ ] **Step 6: Commit**

```bash
git add services/incident-kb/src/argus_kb/ontology.py services/incident-kb/tests/__init__.py services/incident-kb/tests/test_ontology.py
git commit -m "kb: define entity ontology for graphiti"
```

---

## Task 5: Graphiti client wrapper + Neo4j retry

**Files:**
- Create: `services/incident-kb/src/argus_kb/graph.py`

- [ ] **Step 1: Write `graph.py`**

```python
"""Graphiti singleton wrapper. Owns the Neo4j connection and provides
typed methods for ingest, search, and subgraph fetch.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any

from graphiti_core import Graphiti
from neo4j import AsyncGraphDatabase, exceptions as neo4j_exc

from argus_kb.config import settings
from argus_kb.ontology import ENTITY_TYPES

log = logging.getLogger(__name__)

_graphiti: Graphiti | None = None
_neo4j_driver = None


async def _wait_for_neo4j(uri: str, user: str, password: str, attempts: int = 15) -> None:
    """Retry Neo4j connect with exponential backoff up to ~30 s total."""
    delay = 0.5
    last_err: Exception | None = None
    for i in range(attempts):
        try:
            driver = AsyncGraphDatabase.driver(uri, auth=(user, password))
            await driver.verify_connectivity()
            await driver.close()
            return
        except neo4j_exc.ServiceUnavailable as e:
            last_err = e
            log.info("neo4j unavailable (try %d/%d), sleeping %.1fs", i + 1, attempts, delay)
            await asyncio.sleep(delay)
            delay = min(delay * 1.6, 4.0)
    raise RuntimeError(f"neo4j did not become available: {last_err}")


async def get_graphiti() -> Graphiti:
    global _graphiti
    if _graphiti is not None:
        return _graphiti
    await _wait_for_neo4j(settings.neo4j_uri, settings.neo4j_user, settings.neo4j_password)
    _graphiti = Graphiti(
        settings.neo4j_uri,
        settings.neo4j_user,
        settings.neo4j_password,
    )
    await _graphiti.build_indices_and_constraints()
    log.info("graphiti ready")
    return _graphiti


async def get_neo4j_driver():
    global _neo4j_driver
    if _neo4j_driver is None:
        _neo4j_driver = AsyncGraphDatabase.driver(
            settings.neo4j_uri,
            auth=(settings.neo4j_user, settings.neo4j_password),
        )
    return _neo4j_driver


async def close_all() -> None:
    global _graphiti, _neo4j_driver
    if _graphiti is not None:
        await _graphiti.close()
        _graphiti = None
    if _neo4j_driver is not None:
        await _neo4j_driver.close()
        _neo4j_driver = None


__all__ = ["get_graphiti", "get_neo4j_driver", "close_all", "ENTITY_TYPES"]
```

- [ ] **Step 2: Smoke-test connection**

Ensure Neo4j is running: `docker compose up -d neo4j`

Run: `uv --directory services/incident-kb run python -c "
import asyncio
from argus_kb.graph import get_graphiti, close_all
async def main():
    g = await get_graphiti()
    print('graphiti up:', type(g).__name__)
    await close_all()
asyncio.run(main())
"`

Expected: `graphiti up: Graphiti` (allow first run to download embedding model — may take 60 s).

If you see import errors for `Graphiti`, the installed `graphiti-core` exposes a different entrypoint; read the package's `__init__.py` and adjust the import:
`uv --directory services/incident-kb run python -c "import graphiti_core; print(dir(graphiti_core))"`

- [ ] **Step 3: Commit**

```bash
git add services/incident-kb/src/argus_kb/graph.py
git commit -m "kb: graphiti singleton with neo4j retry"
```

---

## Task 6: Ingest pipeline (bundle → episode)

**Files:**
- Create: `services/incident-kb/src/argus_kb/ingest.py`
- Create: `services/incident-kb/tests/test_ingest_bundle.py`

- [ ] **Step 1: Write failing test**

```python
import pytest

from argus_kb.ingest import IncidentBundle, build_episode_body, validate_bundle


def test_incident_bundle_parses_minimum():
    b = IncidentBundle(
        incident_id="worker-oom-abc",
        title="Worker OOM",
        report_md="# RC\nleak",
        scenario="worker-oom",
        failed_over=False,
        severity="sev2",
        resolved_at="2026-05-25T10:00:00Z",
        services_touched=["worker", "api"],
        tool_log_digest="search_logs→worker leak detected",
    )
    assert b.incident_id == "worker-oom-abc"
    assert b.severity == "sev2"


def test_build_episode_body_includes_metadata():
    b = IncidentBundle(
        incident_id="x",
        title="t",
        report_md="body md",
        scenario="db-saturation",
        failed_over=True,
        severity="sev1",
        resolved_at="2026-05-25T10:00:00Z",
        services_touched=["db_proxy"],
        tool_log_digest="query_metrics→slow",
    )
    body = build_episode_body(b)
    assert "body md" in body
    assert "sev1" in body
    assert "failed_over=true" in body
    assert "services_touched=db_proxy" in body
    assert "scenario=db-saturation" in body


def test_validate_bundle_rejects_unknown_severity():
    with pytest.raises(ValueError, match="severity"):
        validate_bundle(
            IncidentBundle(
                incident_id="x",
                title="t",
                report_md="md",
                scenario=None,
                failed_over=False,
                severity="sev9",
                resolved_at="2026-05-25T10:00:00Z",
                services_touched=[],
                tool_log_digest="",
            )
        )
```

- [ ] **Step 2: Run test, confirm failure**

Run: `uv --directory services/incident-kb run pytest tests/test_ingest_bundle.py -v`
Expected: `ModuleNotFoundError: No module named 'argus_kb.ingest'`

- [ ] **Step 3: Write `ingest.py`**

```python
"""Convert an incident bundle into a Graphiti episode and submit it."""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone

from pydantic import BaseModel

from argus_kb.config import settings
from argus_kb.graph import get_graphiti
from argus_kb.ontology import ENTITY_TYPES

log = logging.getLogger(__name__)

VALID_SEVERITIES = {"sev1", "sev2", "sev3"}


class IncidentBundle(BaseModel):
    incident_id: str
    title: str
    report_md: str
    scenario: str | None
    failed_over: bool
    severity: str
    resolved_at: str
    services_touched: list[str]
    tool_log_digest: str


def validate_bundle(b: IncidentBundle) -> None:
    if b.severity not in VALID_SEVERITIES:
        raise ValueError(f"severity must be one of {VALID_SEVERITIES}, got {b.severity!r}")
    if not b.incident_id:
        raise ValueError("incident_id required")
    if not b.report_md.strip():
        raise ValueError("report_md cannot be empty")


def build_episode_body(b: IncidentBundle) -> str:
    """Compose the episode body shown to Graphiti's extractor.

    Structured metadata is included as plain-text key=value lines so the
    extractor picks them up; the markdown report is appended verbatim.
    """
    lines = [
        f"incident_id={b.incident_id}",
        f"title={b.title}",
        f"severity={b.severity}",
        f"failed_over={'true' if b.failed_over else 'false'}",
        f"scenario={b.scenario or 'none'}",
        f"resolved_at={b.resolved_at}",
        f"services_touched={','.join(b.services_touched) if b.services_touched else 'none'}",
        f"tool_log_digest={b.tool_log_digest}",
        "---",
        b.report_md.strip(),
    ]
    return "\n".join(lines)


async def ingest_bundle(b: IncidentBundle) -> str:
    """Submit episode to Graphiti. Returns a job id."""
    validate_bundle(b)
    g = await get_graphiti()
    job_id = f"ingest-{uuid.uuid4().hex[:12]}"
    name = f"incident:{b.incident_id}"
    body = build_episode_body(b)
    reference_time = datetime.fromisoformat(b.resolved_at.replace("Z", "+00:00"))
    if reference_time.tzinfo is None:
        reference_time = reference_time.replace(tzinfo=timezone.utc)

    await g.add_episode(
        name=name,
        episode_body=body,
        source_description="argus-final-report",
        reference_time=reference_time,
        group_id=settings.graphiti_group_id,
        entity_types=ENTITY_TYPES,
    )
    log.info("ingest queued: incident=%s job=%s", b.incident_id, job_id)
    return job_id
```

- [ ] **Step 4: Run tests**

Run: `uv --directory services/incident-kb run pytest tests/test_ingest_bundle.py -v`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add services/incident-kb/src/argus_kb/ingest.py services/incident-kb/tests/test_ingest_bundle.py
git commit -m "kb: incident bundle validation + episode body builder"
```

---

## Task 7: Admin API — /admin/ingest, /admin/reset

**Files:**
- Modify: `services/incident-kb/src/argus_kb/admin_api.py`

- [ ] **Step 1: Rewrite `admin_api.py`**

```python
import logging

from fastapi import FastAPI, HTTPException

from argus_kb.config import settings
from argus_kb.graph import get_graphiti, close_all
from argus_kb.ingest import IncidentBundle, ingest_bundle

log = logging.getLogger(__name__)

app = FastAPI(title="argus-kb-admin")


@app.on_event("startup")
async def _startup() -> None:
    # Pre-warm Graphiti + embedding model so first request is fast.
    await get_graphiti()


@app.on_event("shutdown")
async def _shutdown() -> None:
    await close_all()


@app.get("/health")
async def health() -> dict[str, bool]:
    return {"ok": True}


@app.post("/admin/ingest")
async def admin_ingest(bundle: IncidentBundle) -> dict[str, str]:
    try:
        job_id = await ingest_bundle(bundle)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"job_id": job_id, "status": "queued"}


@app.post("/admin/reset")
async def admin_reset() -> dict[str, bool]:
    g = await get_graphiti()
    # Graphiti exposes clear_data / clear_graph depending on version.
    if hasattr(g, "clear_data"):
        await g.clear_data(group_ids=[settings.graphiti_group_id])
    else:
        await g.clear_graph(group_id=settings.graphiti_group_id)
    return {"ok": True}
```

- [ ] **Step 2: Smoke-test ingest endpoint**

Start service: `uv --directory services/incident-kb run argus-kb &` and `sleep 5`.

Run:
```bash
curl -s -X POST http://localhost:7301/admin/ingest \
  -H 'content-type: application/json' \
  -d '{
    "incident_id":"smoke-001","title":"Smoke","report_md":"# Smoke\nleak",
    "scenario":"worker-oom","failed_over":false,"severity":"sev2",
    "resolved_at":"2026-05-25T10:00:00Z","services_touched":["worker"],
    "tool_log_digest":"search_logs→leak"
  }'
```

Expected: `{"job_id":"ingest-<hex>","status":"queued"}` within ~10 s (first ingest may need Gemini key validation).

- [ ] **Step 3: Verify a node landed in Neo4j**

Run:
```bash
docker exec argus-neo4j cypher-shell -u neo4j -p devpass \
  "MATCH (n) WHERE n.group_id='argus_incidents' RETURN labels(n), n.name LIMIT 5;"
```

Expected: At least one row with labels like `[Episodic]` or `[Entity]`. If empty, allow 30 s more — Graphiti extraction is async.

- [ ] **Step 4: Smoke-test reset endpoint**

Run: `curl -s -X POST http://localhost:7301/admin/reset`
Expected: `{"ok":true}`

Verify graph cleared:
```bash
docker exec argus-neo4j cypher-shell -u neo4j -p devpass \
  "MATCH (n) WHERE n.group_id='argus_incidents' RETURN count(n);"
```
Expected: `0`.

Stop service: `pkill -f argus_kb`.

- [ ] **Step 5: Commit**

```bash
git add services/incident-kb/src/argus_kb/admin_api.py
git commit -m "kb: admin api ingest + reset endpoints"
```

---

## Task 8: Seed script

**Files:**
- Create: `scripts/seed-kb.ts`

- [ ] **Step 1: Write `scripts/seed-kb.ts`**

```typescript
#!/usr/bin/env tsx
const ADMIN = process.env.INCIDENT_KB_ADMIN_URL ?? "http://localhost:7301";

interface Seed {
  incident_id: string;
  title: string;
  report_md: string;
  scenario: string | null;
  failed_over: boolean;
  severity: "sev1" | "sev2" | "sev3";
  resolved_at: string;
  services_touched: string[];
  tool_log_digest: string;
}

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86400_000).toISOString();
}

const SEEDS: Seed[] = [
  {
    incident_id: "worker-oom-2024-q4-001",
    title: "Worker heap leak under heavy enqueue",
    report_md: "# Root Cause\nWorker memory leak triggered by unflushed job buffer.\n# Remediation\nRestart worker; patch buffer flush.",
    scenario: "worker-oom",
    failed_over: false,
    severity: "sev2",
    resolved_at: daysAgo(58),
    services_touched: ["worker", "api"],
    tool_log_digest: "search_logs→buffer not flushing; query_metrics→heap monotonic.",
  },
  {
    incident_id: "db-saturation-2024-q4-002",
    title: "db_proxy saturated by N+1 query",
    report_md: "# Root Cause\nN+1 query in /process endpoint, 1.5s/request under load.\n# Remediation\nAdd query batch.",
    scenario: "db-saturation",
    failed_over: true,
    severity: "sev1",
    resolved_at: daysAgo(51),
    services_touched: ["db_proxy", "api"],
    tool_log_digest: "query_metrics→db_proxy p95 spike; query_traces→N+1 pattern.",
  },
  {
    incident_id: "auth-flap-2024-q4-003",
    title: "Auth service flapping on token rotation",
    report_md: "# Root Cause\nToken cache TTL shorter than rotation interval.\n# Remediation\nExtend cache TTL.",
    scenario: null,
    failed_over: false,
    severity: "sev2",
    resolved_at: daysAgo(44),
    services_touched: ["auth", "api"],
    tool_log_digest: "search_logs→auth 401 burst; read_runbook→token rotation.",
  },
  {
    incident_id: "network-partition-2024-q4-004",
    title: "Worker isolated from db_proxy",
    report_md: "# Root Cause\nTransient network partition between worker pool and db_proxy.\n# Remediation\nFailover and retry.",
    scenario: null,
    failed_over: true,
    severity: "sev1",
    resolved_at: daysAgo(38),
    services_touched: ["worker", "db_proxy"],
    tool_log_digest: "query_metrics→worker timeout spike.",
  },
  {
    incident_id: "config-drift-2024-q4-005",
    title: "Stale rate-limit config on api",
    report_md: "# Root Cause\nConfig drift: api held outdated rate-limit after rolling restart skipped one pod.\n# Remediation\nRedeploy api.",
    scenario: null,
    failed_over: false,
    severity: "sev3",
    resolved_at: daysAgo(31),
    services_touched: ["api"],
    tool_log_digest: "search_logs→rate-limit hits; read_runbook→config drift.",
  },
  {
    incident_id: "worker-oom-2025-q1-006",
    title: "Worker OOM under tracing buffer growth",
    report_md: "# Root Cause\nTracing buffer not draining.\n# Remediation\nLower buffer size, flush every 5s.",
    scenario: "worker-oom",
    failed_over: false,
    severity: "sev2",
    resolved_at: daysAgo(24),
    services_touched: ["worker"],
    tool_log_digest: "query_traces→tracing queue growing.",
  },
  {
    incident_id: "db-saturation-2025-q1-007",
    title: "db_proxy slow_query from missing index",
    report_md: "# Root Cause\nMissing index on jobs.created_at.\n# Remediation\nCreate index.",
    scenario: "db-saturation",
    failed_over: false,
    severity: "sev1",
    resolved_at: daysAgo(17),
    services_touched: ["db_proxy"],
    tool_log_digest: "query_metrics→slow_query rate up; search_logs→full scan warnings.",
  },
  {
    incident_id: "cpu-saturation-2025-q1-008",
    title: "Worker CPU pinned by regex hot loop",
    report_md: "# Root Cause\nRegex backtracking in log parser.\n# Remediation\nReplace regex with linear parser.",
    scenario: null,
    failed_over: false,
    severity: "sev2",
    resolved_at: daysAgo(13),
    services_touched: ["worker"],
    tool_log_digest: "query_metrics→worker cpu 100%; query_traces→hot loop.",
  },
  {
    incident_id: "memleak-2025-q1-009",
    title: "API service memleak via response cache",
    report_md: "# Root Cause\nUnbounded response cache on api.\n# Remediation\nAdd LRU bound.",
    scenario: null,
    failed_over: false,
    severity: "sev2",
    resolved_at: daysAgo(9),
    services_touched: ["api"],
    tool_log_digest: "query_metrics→api heap growth.",
  },
  {
    incident_id: "auth-failure-2025-q1-010",
    title: "Auth service outage from upstream cert expiry",
    report_md: "# Root Cause\nUpstream certificate expired.\n# Remediation\nRotate cert.",
    scenario: null,
    failed_over: true,
    severity: "sev1",
    resolved_at: daysAgo(5),
    services_touched: ["auth"],
    tool_log_digest: "search_logs→cert verify failed; read_runbook→cert rotation.",
  },
  {
    incident_id: "config-drift-2025-q1-011",
    title: "Gateway timeout config too aggressive",
    report_md: "# Root Cause\nGateway timeout 1s caused cascade failover.\n# Remediation\nRaise to 3s.",
    scenario: null,
    failed_over: false,
    severity: "sev2",
    resolved_at: daysAgo(3),
    services_touched: ["gateway", "api"],
    tool_log_digest: "query_metrics→gateway timeout count up.",
  },
  {
    incident_id: "worker-oom-2025-q1-012",
    title: "Worker OOM under large payload batch",
    report_md: "# Root Cause\nBatch size 10x normal exhausted heap.\n# Remediation\nCap batch size.",
    scenario: "worker-oom",
    failed_over: true,
    severity: "sev2",
    resolved_at: daysAgo(1),
    services_touched: ["worker", "api"],
    tool_log_digest: "search_logs→OOM kill; query_metrics→heap saturation.",
  },
];

async function main(): Promise<void> {
  let ok = 0;
  let fail = 0;
  for (const seed of SEEDS) {
    process.stdout.write(`  → ${seed.incident_id} ... `);
    try {
      const r = await fetch(`${ADMIN}/admin/ingest`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(seed),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
      const j = (await r.json()) as { job_id: string };
      console.log(`ok (${j.job_id})`);
      ok += 1;
    } catch (err) {
      console.log(`FAIL: ${(err as Error).message}`);
      fail += 1;
    }
  }
  console.log(`\nseeded ${ok}/${SEEDS.length} incidents (${fail} failures)`);
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Run the seed**

Ensure Neo4j + KB service running. Then:
Run: `pnpm seed-kb`
Expected: 12 lines `→ <incident_id> ... ok (ingest-<hex>)` ending with `seeded 12/12 incidents (0 failures)`.

Note: First ingest may stall up to 60 s while Gemini key is validated and embedding model warms. Allow up to 3 min total for full seed.

- [ ] **Step 3: Verify the graph in Neo4j Browser**

Open http://localhost:7474, login `neo4j`/`devpass`, run:
```cypher
MATCH (n) WHERE n.group_id='argus_incidents' RETURN n LIMIT 100;
```

Expected: Visible graph with multiple node types and edges. Eyeball that you see incident-shaped clusters.

- [ ] **Step 4: Commit**

```bash
git add scripts/seed-kb.ts
git commit -m "kb: seed script with 12 synthetic past incidents"
```

---

## Task 9: Case-graph subgraph fetch

**Files:**
- Create: `services/incident-kb/src/argus_kb/case_graph.py`
- Create: `services/incident-kb/tests/test_case_graph_shape.py`

- [ ] **Step 1: Write failing test**

```python
from argus_kb.case_graph import shape_for_react_flow


def test_shape_transforms_neo4j_records_to_react_flow():
    raw_nodes = [
        {"id": "n1", "labels": ["Incident"], "props": {"incident_id": "worker-oom-abc", "title": "Worker OOM"}},
        {"id": "n2", "labels": ["Service"], "props": {"name": "worker"}},
        {"id": "n3", "labels": ["RootCause"], "props": {"category": "memleak", "summary": "heap leak"}},
    ]
    raw_edges = [
        {"source": "n1", "target": "n2", "type": "INVOLVES", "props": {}},
        {"source": "n1", "target": "n3", "type": "CAUSED_BY", "props": {}},
    ]
    result = shape_for_react_flow(raw_nodes, raw_edges, focus_neo4j_id="n1")

    assert result["focus_id"] == "n1"
    assert len(result["nodes"]) == 3
    incident = next(n for n in result["nodes"] if n["id"] == "n1")
    assert incident["type"] == "incident"
    assert incident["label"] == "Worker OOM"
    assert len(result["edges"]) == 2
    assert result["edges"][0]["label"] == "involves"


def test_shape_handles_unlabeled_node():
    out = shape_for_react_flow(
        [{"id": "x", "labels": [], "props": {"name": "fallback"}}],
        [],
        focus_neo4j_id="x",
    )
    assert out["nodes"][0]["type"] == "other"
    assert out["nodes"][0]["label"] == "fallback"
```

- [ ] **Step 2: Run test, confirm failure**

Run: `uv --directory services/incident-kb run pytest tests/test_case_graph_shape.py -v`
Expected: `ModuleNotFoundError: No module named 'argus_kb.case_graph'`

- [ ] **Step 3: Write `case_graph.py`**

```python
"""Fetch a 2-hop subgraph around an incident node and shape it for React Flow."""
from __future__ import annotations

from typing import Any

from argus_kb.config import settings
from argus_kb.graph import get_neo4j_driver

LABEL_TO_TYPE = {
    "Incident": "incident",
    "Service": "service",
    "RootCause": "root_cause",
    "Remediation": "remediation",
}

EDGE_LABEL = {
    "INVOLVES": "involves",
    "CAUSED_BY": "caused by",
    "REMEDIATED_BY": "remediated by",
    "PRECEDED_BY": "preceded by",
    "MENTIONS": "mentions",
    "RELATES_TO": "relates to",
}


def shape_for_react_flow(
    raw_nodes: list[dict[str, Any]],
    raw_edges: list[dict[str, Any]],
    focus_neo4j_id: str,
) -> dict[str, Any]:
    nodes_out = []
    for n in raw_nodes:
        labels: list[str] = n.get("labels") or []
        props: dict[str, Any] = n.get("props") or {}
        typed = next((LABEL_TO_TYPE[l] for l in labels if l in LABEL_TO_TYPE), "other")
        label = (
            props.get("title")
            or props.get("name")
            or props.get("summary")
            or props.get("incident_id")
            or "untitled"
        )
        nodes_out.append({
            "id": n["id"],
            "type": typed,
            "label": label,
            "meta": props,
        })

    edges_out = []
    for e in raw_edges:
        t = e.get("type", "RELATES_TO")
        edges_out.append({
            "source": e["source"],
            "target": e["target"],
            "type": t,
            "label": EDGE_LABEL.get(t, t.lower().replace("_", " ")),
        })

    return {"nodes": nodes_out, "edges": edges_out, "focus_id": focus_neo4j_id}


async def fetch_case_subgraph(incident_id: str) -> dict[str, Any]:
    """Walk 2 hops out from the incident node with the given incident_id."""
    driver = await get_neo4j_driver()
    cypher = """
    MATCH (i {incident_id: $incident_id, group_id: $group_id})
    WITH i
    CALL apoc.path.subgraphAll(i, {maxLevel: 2, relationshipFilter: '>|<'})
    YIELD nodes, relationships
    RETURN
      [n IN nodes | {id: toString(elementId(n)), labels: labels(n), props: properties(n)}] AS rn,
      [r IN relationships | {source: toString(elementId(startNode(r))), target: toString(elementId(endNode(r))), type: type(r), props: properties(r)}] AS re,
      toString(elementId(i)) AS focus_id
    """
    async with driver.session() as session:
        result = await session.run(
            cypher,
            incident_id=incident_id,
            group_id=settings.graphiti_group_id,
        )
        record = await result.single()
        if record is None:
            return {"nodes": [], "edges": [], "focus_id": ""}
        return shape_for_react_flow(record["rn"], record["re"], record["focus_id"])
```

- [ ] **Step 4: Run tests**

Run: `uv --directory services/incident-kb run pytest tests/test_case_graph_shape.py -v`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add services/incident-kb/src/argus_kb/case_graph.py services/incident-kb/tests/test_case_graph_shape.py
git commit -m "kb: 2-hop subgraph fetch + react flow shape"
```

---

## Task 10: Add /case-graph endpoint to admin API

**Files:**
- Modify: `services/incident-kb/src/argus_kb/admin_api.py`

- [ ] **Step 1: Add endpoint to `admin_api.py`**

Append after the existing `/admin/reset` handler:

```python
from argus_kb.case_graph import fetch_case_subgraph


@app.get("/case-graph/{incident_id}")
async def case_graph(incident_id: str) -> dict:
    subgraph = await fetch_case_subgraph(incident_id)
    if not subgraph["nodes"]:
        raise HTTPException(status_code=404, detail=f"incident {incident_id} not found in graph")
    return subgraph
```

(Move the import to the top of the file with the others.)

- [ ] **Step 2: Smoke-test**

Start service. With seeded data:
Run: `curl -s http://localhost:7301/case-graph/worker-oom-2024-q4-001 | python -m json.tool`
Expected: JSON with `nodes`, `edges`, `focus_id` keys. `nodes` should include the queried incident plus connected services/causes.

- [ ] **Step 3: Commit**

```bash
git add services/incident-kb/src/argus_kb/admin_api.py
git commit -m "kb: /case-graph/:incident_id endpoint"
```

---

## Task 11: MCP server exposing read_incident_kb

**Files:**
- Create: `services/incident-kb/src/argus_kb/mcp_server.py`
- Modify: `services/incident-kb/src/argus_kb/main.py`

- [ ] **Step 1: Write `mcp_server.py`**

```python
"""MCP server exposing read_incident_kb over HTTP (streamable transport).

This stands up alongside the admin API. The orchestrator connects via
StreamableHTTPClientTransport to http://localhost:7300/mcp.
"""
from __future__ import annotations

import logging
from typing import Any

from mcp.server.fastmcp import FastMCP

from argus_kb.config import settings
from argus_kb.graph import get_graphiti

log = logging.getLogger(__name__)

mcp = FastMCP("argus-incident-kb", port=settings.mcp_port, host="0.0.0.0")


@mcp.tool()
async def read_incident_kb(query: str, max_results: int = 5) -> dict[str, Any]:
    """Search the incident knowledge graph for cases relevant to the query.

    Returns: { incidents: [{incident_id, title, relevance, relation_path, summary, url}], graph_context: {nodes, edges} }
    """
    g = await get_graphiti()
    hits = await g.search(
        query=query,
        group_ids=[settings.graphiti_group_id],
        num_results=max_results,
    )

    incidents: list[dict[str, Any]] = []
    for h in hits:
        # graphiti search results expose attrs depending on version.
        # Use getattr defensively to survive minor API drift.
        title = getattr(h, "fact", None) or getattr(h, "name", "") or ""
        score = float(getattr(h, "score", 0.0) or 0.0)
        source = getattr(h, "source_node_uuid", None) or getattr(h, "source_id", "")
        incidents.append({
            "incident_id": source,
            "title": str(title)[:140],
            "relevance": score,
            "relation_path": "semantic match",
            "summary": str(title)[:280],
            "url": f"/incident/{source}",
        })

    return {
        "incidents": incidents,
        "graph_context": {"nodes": [], "edges": []},
    }


def run_mcp() -> None:
    mcp.run(transport="streamable-http")
```

- [ ] **Step 2: Update `main.py` to spawn both servers**

Replace contents of `main.py`:

```python
import logging
import multiprocessing as mp

import uvicorn

from argus_kb.config import settings


def _run_admin() -> None:
    uvicorn.run(
        "argus_kb.admin_api:app",
        host="0.0.0.0",
        port=settings.admin_port,
        log_level="info",
    )


def _run_mcp() -> None:
    from argus_kb.mcp_server import run_mcp

    run_mcp()


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    procs = [
        mp.Process(target=_run_admin, daemon=False),
        mp.Process(target=_run_mcp, daemon=False),
    ]
    for p in procs:
        p.start()
    try:
        for p in procs:
            p.join()
    except KeyboardInterrupt:
        for p in procs:
            p.terminate()
        for p in procs:
            p.join()


if __name__ == "__main__":
    main()
```

- [ ] **Step 3: Smoke-test MCP endpoint**

Run: `uv --directory services/incident-kb run argus-kb &` and `sleep 8`.

Probe the MCP HTTP transport endpoint with a basic POST:
```bash
curl -s -X POST http://localhost:7300/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}'
```
Expected: 200 with a JSON or SSE response containing `"serverInfo":{"name":"argus-incident-kb"`.

If the response is 404 or 406 the streamable-http transport mount path differs; check `mcp.server.fastmcp.FastMCP` source for the actual path (typically `/mcp` or `/sse`).

Stop service: `pkill -f argus_kb`.

- [ ] **Step 4: Commit**

```bash
git add services/incident-kb/src/argus_kb/mcp_server.py services/incident-kb/src/argus_kb/main.py
git commit -m "kb: mcp server exposing read_incident_kb over http"
```

---

## Task 12: HTTP MCP transport in orchestrator

**Files:**
- Create: `apps/orchestrator/src/mcp-http.ts`
- Modify: `apps/orchestrator/src/index.ts`

- [ ] **Step 1: Write `mcp-http.ts`**

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export class HttpMcpClient {
  private client: Client | null = null;

  constructor(private url: string, private name: string) {}

  async connect(): Promise<void> {
    const transport = new StreamableHTTPClientTransport(new URL(this.url));
    this.client = new Client({ name: this.name, version: "0.1.0" }, { capabilities: {} });
    await this.client.connect(transport);
  }

  async call(tool: string, args: Record<string, unknown>): Promise<unknown> {
    if (!this.client) throw new Error(`http mcp client not connected: ${this.name}`);
    const res = await this.client.callTool({ name: tool, arguments: args });
    return res.content;
  }

  async close(): Promise<void> {
    if (this.client) {
      try { await this.client.close(); } catch {}
      this.client = null;
    }
  }
}
```

- [ ] **Step 2: Verify the import path for the streamable HTTP transport**

Run: `node --input-type=module -e "import('@modelcontextprotocol/sdk/client/streamableHttp.js').then(m => console.log(Object.keys(m)))"`
Expected: An array containing `StreamableHTTPClientTransport`.

If the export name differs (older SDKs used `SseClientTransport`), adjust the import accordingly.

- [ ] **Step 3: Wire client into `index.ts`**

Modify `apps/orchestrator/src/index.ts`. After the existing `mcpClients.connectAll()`:

```typescript
import { HttpMcpClient } from "./mcp-http.js";

const kbMcpUrl = process.env.INCIDENT_KB_MCP_URL ?? "http://localhost:7300/mcp";
const kbClient = new HttpMcpClient(kbMcpUrl, "argus-orchestrator-incident-kb");
try {
  await kbClient.connect();
  console.log(`[argus] incident-kb mcp connected at ${kbMcpUrl}`);
} catch (err) {
  console.warn(`[argus] incident-kb mcp not reachable at ${kbMcpUrl}: ${(err as Error).message}`);
}
```

And replace the existing `pool` instantiation:

```typescript
const pool = new McpPool({
  tools: {
    search_logs: "logs",
    query_metrics: "metrics",
    query_traces: "traces",
    read_runbook: "runbook",
    read_incident_kb: "incident_kb",
  },
  call: async (server, tool, args) => {
    if (server === "incident_kb") return kbClient.call(tool, args);
    return mcpClients.call(server, tool, args);
  },
});
```

And add cleanup in `SIGINT`:

```typescript
process.on("SIGINT", async () => {
  await mcpClients.closeAll();
  await kbClient.close();
  process.exit(0);
});
```

- [ ] **Step 4: Smoke-test**

In a separate terminal: `docker compose up -d neo4j && pnpm dev:kb`.
Wait until KB logs `Uvicorn running on http://0.0.0.0:7301`.

In another terminal: `pnpm dev:orch`.
Expected log line: `[argus] incident-kb mcp connected at http://localhost:7300/mcp`.

Kill both.

- [ ] **Step 5: Commit**

```bash
git add apps/orchestrator/src/mcp-http.ts apps/orchestrator/src/index.ts
git commit -m "orchestrator: HTTP MCP transport for incident kb"
```

---

## Task 13: Add read_incident_kb to AgentAction + system prompt

**Files:**
- Modify: `apps/orchestrator/src/types.ts`
- Modify: `apps/orchestrator/src/prompts.ts`
- Modify: `apps/orchestrator/src/conductor.ts`

- [ ] **Step 1: Extend `AgentAction` in `types.ts`**

Replace the existing `AgentAction` union with:

```typescript
export type AgentAction =
  | "search_logs"
  | "query_metrics"
  | "query_traces"
  | "read_runbook"
  | "read_incident_kb"
  | "report";
```

- [ ] **Step 2: Add `read_incident_kb` to `validActions` in `conductor.ts`**

Find this line in `conductor.ts`:
```typescript
const validActions: AgentAction[] = ["search_logs", "query_metrics", "query_traces", "read_runbook", "report"];
```

Replace with:
```typescript
const validActions: AgentAction[] = ["search_logs", "query_metrics", "query_traces", "read_runbook", "read_incident_kb", "report"];
```

- [ ] **Step 3: Extend the conductor event union in `conductor.ts`**

Find this block in `conductor.ts`:
```typescript
export interface ConductorEvent {
  type:
    | "step_start"
    | "primary_step"
    | "shadow_step"
    | "tool_call"
    | "tool_result"
    | "divergence"
    | "failover"
    | "gateway_mode"
    | "provider_state"
    | "incident_done";
  data: Record<string, unknown>;
}
```

Add `"kb_lookup_started"`, `"kb_lookup_result"`, `"kb_ingest_queued"` to the union:

```typescript
export interface ConductorEvent {
  type:
    | "step_start"
    | "primary_step"
    | "shadow_step"
    | "tool_call"
    | "tool_result"
    | "divergence"
    | "failover"
    | "gateway_mode"
    | "provider_state"
    | "kb_lookup_started"
    | "kb_lookup_result"
    | "kb_ingest_queued"
    | "incident_done";
  data: Record<string, unknown>;
}
```

- [ ] **Step 4: Emit kb_lookup events around the tool call in `conductor.ts`**

Find this section in the conductor loop:
```typescript
    emit({ type: "tool_call", data: { step, tool: parsedPrimary.action, args: parsedPrimary.args } });
    const toolResult = await opts.pool.invoke({ step, tool: parsedPrimary.action, args: parsedPrimary.args });
    appendToolResult(s, toolResult);
    emit({ type: "tool_result", data: { step, status: toolResult.status, result: toolResult.result } });
```

Replace with:
```typescript
    emit({ type: "tool_call", data: { step, tool: parsedPrimary.action, args: parsedPrimary.args } });
    if (parsedPrimary.action === "read_incident_kb") {
      emit({ type: "kb_lookup_started", data: { step, query: String(parsedPrimary.args.query ?? "") } });
    }
    const toolResult = await opts.pool.invoke({ step, tool: parsedPrimary.action, args: parsedPrimary.args });
    appendToolResult(s, toolResult);
    emit({ type: "tool_result", data: { step, status: toolResult.status, result: toolResult.result } });
    if (parsedPrimary.action === "read_incident_kb" && toolResult.status === "ok") {
      const r = toolResult.result as { incidents?: Array<{ incident_id: string }> } | null;
      const incidents = r?.incidents ?? [];
      emit({
        type: "kb_lookup_result",
        data: {
          step,
          hit_count: incidents.length,
          top_ids: incidents.slice(0, 3).map((x) => x.incident_id),
        },
      });
    }
```

- [ ] **Step 5: Add prompt section in `prompts.ts`**

Replace the contents of `prompts.ts` with:

```typescript
export const SYSTEM_PROMPT = `\
You are Argus — an autonomous on-call SRE agent. You investigate live incidents in a small service cluster (services: api, worker, db_proxy, auth).

# Your job
Diagnose the root cause of the current incident, then emit a postmortem-style markdown report. Do NOT take remediation actions (read-only mode).

# Available tools (call exactly one per step via "action")
- search_logs(service?, q?, since_unix?, limit?) — search structured logs
- query_metrics(service?) — get Prometheus metrics text
- query_traces(service?) — get recent spans
- read_runbook(service) — read service runbook
- read_incident_kb(query, max_results?) — retrieve past incidents from the knowledge base. Use early, after forming an initial hypothesis. Returns prior cases sharing services, root causes, or symptoms. Treat returned cases as evidence, not ground truth — verify against live signals before adopting a remediation.
- report() — emit the final markdown report (terminates the loop). Pass the markdown via args.markdown.

# Output schema
Respond with a SINGLE JSON object — no prose outside it — with this shape:

{
  "action": "search_logs" | "query_metrics" | "query_traces" | "read_runbook" | "read_incident_kb" | "report",
  "args": { ... arguments for the action ... },
  "rationale": "<one sentence explaining why this action>",
  "hypotheses": ["<current top hypothesis>", "..."]
}

# When a tool returns status=unavailable
The tool result envelope will contain {status: "unavailable", last_known, hint}. Continue using cached data, try an alternative tool, or note the gap in your final report.

# When done
Call action=report with args={"markdown": "<the full postmortem md>"}. The report must contain: Summary, Timeline, Root Cause, Evidence, Suggested Remediation.
`;
```

- [ ] **Step 6: Run orchestrator tests**

Run: `pnpm --filter @argus/orchestrator test`
Expected: All existing tests pass (no test changes here; types should still compile).

- [ ] **Step 7: Commit**

```bash
git add apps/orchestrator/src/types.ts apps/orchestrator/src/prompts.ts apps/orchestrator/src/conductor.ts
git commit -m "orchestrator: read_incident_kb action + kb lookup events"
```

---

## Task 14: KB admin client (typed HTTP)

**Files:**
- Create: `apps/orchestrator/src/incident-kb-client.ts`
- Create: `apps/orchestrator/test/incident-kb-client.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { IncidentKbClient } from "../src/incident-kb-client.js";

describe("IncidentKbClient", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("posts ingest bundle and returns job_id", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ job_id: "ingest-abc", status: "queued" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const c = new IncidentKbClient("http://localhost:7301");
    const out = await c.ingest({
      incident_id: "x",
      title: "t",
      report_md: "md",
      scenario: null,
      failed_over: false,
      severity: "sev2",
      resolved_at: "2026-01-01T00:00:00Z",
      services_touched: [],
      tool_log_digest: "",
    });

    expect(out.job_id).toBe("ingest-abc");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:7301/admin/ingest",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("fetches case graph", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ nodes: [], edges: [], focus_id: "x" }),
    }));

    const c = new IncidentKbClient("http://localhost:7301");
    const g = await c.caseGraph("worker-oom-1");
    expect(g.focus_id).toBe("x");
  });

  it("throws on non-2xx", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "boom",
    }));
    const c = new IncidentKbClient("http://localhost:7301");
    await expect(c.reset()).rejects.toThrow(/kb reset failed/i);
  });
});
```

- [ ] **Step 2: Run test, confirm failure**

Run: `pnpm --filter @argus/orchestrator test -- incident-kb-client`
Expected: Error about missing `IncidentKbClient` module.

- [ ] **Step 3: Write `incident-kb-client.ts`**

```typescript
export interface IncidentBundle {
  incident_id: string;
  title: string;
  report_md: string;
  scenario: string | null;
  failed_over: boolean;
  severity: "sev1" | "sev2" | "sev3";
  resolved_at: string;
  services_touched: string[];
  tool_log_digest: string;
}

export interface CaseGraphNode {
  id: string;
  type: "incident" | "service" | "root_cause" | "remediation" | "other";
  label: string;
  meta: Record<string, unknown>;
}

export interface CaseGraphEdge {
  source: string;
  target: string;
  type: string;
  label: string;
}

export interface CaseGraph {
  nodes: CaseGraphNode[];
  edges: CaseGraphEdge[];
  focus_id: string;
}

export class IncidentKbClient {
  constructor(private adminUrl: string) {}

  async ingest(bundle: IncidentBundle): Promise<{ job_id: string; status: string }> {
    const r = await fetch(`${this.adminUrl}/admin/ingest`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(bundle),
    });
    if (!r.ok) throw new Error(`kb ingest failed: ${r.status} ${await r.text()}`);
    return (await r.json()) as { job_id: string; status: string };
  }

  async reset(): Promise<void> {
    const r = await fetch(`${this.adminUrl}/admin/reset`, { method: "POST" });
    if (!r.ok) throw new Error(`kb reset failed: ${r.status}`);
  }

  async caseGraph(incidentId: string): Promise<CaseGraph> {
    const r = await fetch(`${this.adminUrl}/case-graph/${encodeURIComponent(incidentId)}`);
    if (!r.ok) throw new Error(`kb caseGraph failed: ${r.status}`);
    return (await r.json()) as CaseGraph;
  }
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @argus/orchestrator test -- incident-kb-client`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add apps/orchestrator/src/incident-kb-client.ts apps/orchestrator/test/incident-kb-client.test.ts
git commit -m "orchestrator: typed http client for kb admin api"
```

---

## Task 15: Auto-ingest on incident_done

**Files:**
- Modify: `apps/orchestrator/src/server.ts`
- Modify: `apps/orchestrator/src/index.ts`

- [ ] **Step 1: Extend `AppDeps` in `server.ts`**

Replace the `AppDeps` interface and the `buildApp` signature accordingly.

```typescript
import { IncidentKbClient } from "./incident-kb-client.js";

interface AppDeps {
  gateway: GatewayClient;
  pool: McpPool;
  registry: ProviderRegistry;
  chaosState: {
    killClaude: boolean;
    killNemotron: boolean;
    gatewayDown: boolean;
  };
  kb: IncidentKbClient | null;
}
```

- [ ] **Step 2: Extend incident entry to remember scenario + failover**

Find this block in `server.ts`:
```typescript
  const incidents = new Map<
    string,
    {
      events: ConductorEvent[];
      subs: Array<(e: ConductorEvent) => void>;
      done: boolean;
      startedAt: number;
      endedAt?: number;
      scenario?: string;
    }
  >();
```

No change needed — `scenario` is already tracked. Move on.

- [ ] **Step 3: Add severity table + bundle builder in `server.ts`**

Add near the top of `buildApp`, before `spawnIncident`:

```typescript
  const SEVERITY_BY_SCENARIO: Record<string, "sev1" | "sev2" | "sev3"> = {
    "worker-oom": "sev2",
    "db-saturation": "sev1",
  };

  const KNOWN_SERVICES = new Set(["worker", "db_proxy", "auth", "gateway", "api"]);

  function statusFromEvents(events: ConductorEvent[]): "resolved" | "halted" | "failed_over" | "running" {
    const failoverEvt = events.find((e) => e.type === "failover");
    const doneEvt = [...events].reverse().find((e) => e.type === "incident_done");
    if (!doneEvt) return failoverEvt ? "failed_over" : "running";
    const preview = ((doneEvt.data as { report_md?: string }).report_md ?? "").toLowerCase();
    if (preview.includes("halted") || preview.includes("incomplete")) return "halted";
    return "resolved";
  }

  function buildBundle(id: string, scenarioId: string | undefined, events: ConductorEvent[]) {
    const doneEvt = [...events].reverse().find((e) => e.type === "incident_done");
    const reportMd = String((doneEvt?.data as { report_md?: string })?.report_md ?? "");
    const failedOver = events.some((e) => e.type === "failover");
    const severity: "sev1" | "sev2" | "sev3" = scenarioId ? (SEVERITY_BY_SCENARIO[scenarioId] ?? "sev2") : "sev2";

    const servicesTouched = Array.from(
      new Set(
        events
          .filter((e) => e.type === "tool_call")
          .map((e) => String((e.data as { args?: { service?: string } }).args?.service ?? ""))
          .filter((s) => KNOWN_SERVICES.has(s)),
      ),
    );

    const toolLines = events
      .filter((e) => e.type === "tool_call")
      .slice(0, 12)
      .map((e) => {
        const d = e.data as { tool?: string; args?: Record<string, unknown> };
        return `${d.tool}(${JSON.stringify(d.args ?? {})})`;
      });
    const toolLogDigest = toolLines.join("; ").slice(0, 1200);

    const title = scenarioId ? `${scenarioId} ${id}` : `Incident ${id}`;

    return {
      incident_id: id,
      title,
      report_md: reportMd || "# Incident\n(no report content)",
      scenario: scenarioId ?? null,
      failed_over: failedOver,
      severity,
      resolved_at: new Date().toISOString(),
      services_touched: servicesTouched,
      tool_log_digest: toolLogDigest,
    };
  }
```

- [ ] **Step 4: Hook auto-ingest into the `spawnIncident` emit closure**

Find in `spawnIncident`:
```typescript
      emit: (e) => {
        entry.events.push(e);
        for (const fn of entry.subs) fn(e);
        if (e.type === "incident_done") {
          entry.done = true;
          entry.endedAt = Date.now();
        }
      },
```

Replace with:
```typescript
      emit: (e) => {
        entry.events.push(e);
        for (const fn of entry.subs) fn(e);
        if (e.type === "incident_done") {
          entry.done = true;
          entry.endedAt = Date.now();
          const status = statusFromEvents(entry.events);
          if (status === "resolved" && deps.kb) {
            const bundle = buildBundle(id, entry.scenario, entry.events);
            deps.kb.ingest(bundle).then(
              (res) => {
                const evt: ConductorEvent = { type: "kb_ingest_queued", data: { job_id: res.job_id } };
                entry.events.push(evt);
                for (const fn of entry.subs) fn(evt);
              },
              (err: unknown) => {
                console.warn(`[argus] kb ingest failed for ${id}: ${(err as Error).message}`);
              },
            );
          }
        }
      },
```

- [ ] **Step 5: Wire KB client in `index.ts`**

After the `kbClient` HTTP MCP block in `index.ts`, add:

```typescript
import { IncidentKbClient } from "./incident-kb-client.js";

const kbAdmin = process.env.INCIDENT_KB_ADMIN_URL
  ? new IncidentKbClient(process.env.INCIDENT_KB_ADMIN_URL)
  : null;
```

Then update the `buildApp` call:

```typescript
const { app } = buildApp({ gateway, pool, registry, chaosState, kb: kbAdmin });
```

- [ ] **Step 6: Run orchestrator tests**

Run: `pnpm --filter @argus/orchestrator test`
Expected: All tests pass (existing tests don't pass a `kb` dep — verify by running and reading any failures).

If `e2e-resilience.test.ts` or others call `buildApp` directly without a `kb` field, add `kb: null` to those calls. List of test files to check:

```bash
grep -rn "buildApp" /Users/adityarawat/Documents/github/devnetwork-hackathon-2026/apps/orchestrator/test/
```

For each file that calls `buildApp({ ... })`, add `kb: null,` to the dep object.

- [ ] **Step 7: Re-run tests**

Run: `pnpm --filter @argus/orchestrator test`
Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add apps/orchestrator/src/server.ts apps/orchestrator/src/index.ts apps/orchestrator/test/
git commit -m "orchestrator: auto-ingest resolved incidents into kb"
```

---

## Task 16: Orchestrator /case-graph and /admin/kb endpoints

**Files:**
- Modify: `apps/orchestrator/src/server.ts`

- [ ] **Step 1: Add three new routes to `server.ts`**

Append before the final `return { app, incidents };` line:

```typescript
  app.get("/incident/:id/case-graph", async (c) => {
    if (!deps.kb) return c.json({ error: "kb unavailable" }, 503);
    const id = c.req.param("id");
    try {
      const graph = await deps.kb.caseGraph(id);
      return c.json(graph);
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes("404")) return c.json({ error: "not in kb yet" }, 404);
      return c.json({ error: msg }, 502);
    }
  });

  app.post("/admin/kb/reset", async (c) => {
    if (!deps.kb) return c.json({ error: "kb unavailable" }, 503);
    try {
      await deps.kb.reset();
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 502);
    }
  });

  app.post("/admin/kb/ingest", async (c) => {
    if (!deps.kb) return c.json({ error: "kb unavailable" }, 503);
    const id = c.req.query("id");
    if (!id) return c.json({ error: "id query required" }, 400);
    const entry = incidents.get(id);
    if (!entry) return c.json({ error: "unknown incident" }, 404);
    try {
      const bundle = buildBundle(id, entry.scenario, entry.events);
      const res = await deps.kb.ingest(bundle);
      return c.json({ ok: true, job_id: res.job_id });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 502);
    }
  });
```

- [ ] **Step 2: Smoke-test**

With orchestrator + KB + Neo4j up and seeded:
```bash
curl -s http://localhost:7200/incident/worker-oom-2024-q4-001/case-graph | python -m json.tool | head -40
```
Expected: JSON with `nodes`, `edges`, `focus_id`.

- [ ] **Step 3: Commit**

```bash
git add apps/orchestrator/src/server.ts
git commit -m "orchestrator: case-graph and kb admin endpoints"
```

---

## Task 17: Web — SSE handlers + types extension

**Files:**
- Modify: `apps/web/lib/types.ts`
- Modify: `apps/web/lib/sse.ts`

- [ ] **Step 1: Extend `EventName` in `apps/web/lib/types.ts`**

Replace the file with:

```typescript
export type EventName =
  | "step_start"
  | "primary_step"
  | "shadow_step"
  | "tool_call"
  | "tool_result"
  | "divergence"
  | "failover"
  | "gateway_mode"
  | "provider_state"
  | "kb_lookup_started"
  | "kb_lookup_result"
  | "kb_ingest_queued"
  | "incident_done";

export interface StreamEvent {
  type: EventName;
  data: Record<string, unknown>;
}
```

- [ ] **Step 2: Add handlers in `apps/web/lib/sse.ts`**

Find the `handlers: EventName[]` array and replace with:

```typescript
  const handlers: EventName[] = [
    "step_start", "primary_step", "shadow_step",
    "tool_call", "tool_result", "divergence", "failover",
    "gateway_mode", "provider_state",
    "kb_lookup_started", "kb_lookup_result", "kb_ingest_queued",
    "incident_done",
  ];
```

- [ ] **Step 3: Verify type check**

Run: `pnpm --filter @argus/web exec tsc --noEmit`
Expected: 0 errors. If errors mention `EventName`-keyed records in other files, those are addressed by Task 19's timeline change — that's fine; we'll surface them now to plan ahead.

If the `timeline.tsx` `COLOR`/`LABEL` records error here, that's expected. Skip the type check until Task 19, OR temporarily add stub entries:

```typescript
// Temporary stubs — Task 19 finalizes these.
kb_lookup_started: "var(--color-fg-muted)",
kb_lookup_result: "var(--color-success)",
kb_ingest_queued: "var(--color-fg-muted)",
```

Pick whichever you prefer — if you're going in order, temp stubs let you keep type-checking clean between commits.

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/types.ts apps/web/lib/sse.ts
git commit -m "web: subscribe to kb_lookup and kb_ingest sse events"
```

---

## Task 18: Web — fetch helpers + reactflow dep

**Files:**
- Modify: `apps/web/lib/api.ts`
- Modify: `apps/web/package.json`

- [ ] **Step 1: Add reactflow + dagre to `apps/web/package.json`**

In the `dependencies` block add (alphabetically):

```json
"dagre": "^0.8.5",
"reactflow": "^11.11.4",
```

And in `devDependencies`:
```json
"@types/dagre": "^0.7.52",
```

- [ ] **Step 2: Install**

Run: `pnpm install`
Expected: lockfile updates, no errors.

- [ ] **Step 3: Append API helpers to `apps/web/lib/api.ts`**

Append to the file:

```typescript
export interface CaseGraphNode {
  id: string;
  type: "incident" | "service" | "root_cause" | "remediation" | "other";
  label: string;
  meta: Record<string, unknown>;
}

export interface CaseGraphEdge {
  source: string;
  target: string;
  type: string;
  label: string;
}

export interface CaseGraph {
  nodes: CaseGraphNode[];
  edges: CaseGraphEdge[];
  focus_id: string;
}

export async function getCaseGraph(id: string): Promise<CaseGraph | null> {
  const r = await fetch(`${ORCH}/incident/${id}/case-graph`, { cache: "no-store" });
  if (r.status === 404 || r.status === 503) return null;
  if (!r.ok) throw new Error(`case-graph ${r.status}`);
  return (await r.json()) as CaseGraph;
}

export async function resetKB(): Promise<void> {
  const r = await fetch(`${ORCH}/admin/kb/reset`, { method: "POST" });
  if (!r.ok) throw new Error(`reset kb ${r.status}`);
}

export async function manualIngest(id: string): Promise<void> {
  const r = await fetch(`${ORCH}/admin/kb/ingest?id=${encodeURIComponent(id)}`, { method: "POST" });
  if (!r.ok) throw new Error(`ingest ${r.status}`);
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/package.json apps/web/lib/api.ts pnpm-lock.yaml
git commit -m "web: add reactflow + kb fetch helpers"
```

---

## Task 19: Timeline event styling for KB

**Files:**
- Modify: `apps/web/components/timeline.tsx`

- [ ] **Step 1: Add KB event entries**

In `timeline.tsx`, replace the `COLOR` and `LABEL` `Record`s with:

```typescript
const COLOR: Record<EventName, string> = {
  step_start: "var(--color-fg-dim)",
  primary_step: "var(--color-primary)",
  shadow_step: "var(--color-shadow-prov)",
  tool_call: "var(--color-fg-muted)",
  tool_result: "var(--color-success)",
  divergence: "var(--color-warn)",
  failover: "var(--color-danger)",
  gateway_mode: "var(--color-warn)",
  provider_state: "var(--color-danger)",
  kb_lookup_started: "var(--color-shadow-prov)",
  kb_lookup_result: "var(--color-shadow-prov)",
  kb_ingest_queued: "var(--color-success)",
  incident_done: "var(--color-success)",
};

const LABEL: Record<EventName, string> = {
  step_start: "step",
  primary_step: "primary",
  shadow_step: "shadow",
  tool_call: "tool→",
  tool_result: "tool✓",
  divergence: "diverge",
  failover: "failover",
  gateway_mode: "gateway",
  provider_state: "provider",
  kb_lookup_started: "kb?",
  kb_lookup_result: "kb✓",
  kb_ingest_queued: "kb+",
  incident_done: "done",
};
```

- [ ] **Step 2: Type check**

Run: `pnpm --filter @argus/web exec tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/timeline.tsx
git commit -m "web: timeline styling for kb events"
```

---

## Task 20: CaseGraph React Flow component

**Files:**
- Create: `apps/web/components/case-graph.tsx`

- [ ] **Step 1: Write the component**

```tsx
"use client";
import "reactflow/dist/style.css";
import { useCallback, useEffect, useMemo, useState } from "react";
import ReactFlow, { Background, Controls, MarkerType, type Edge, type Node } from "reactflow";
import dagre from "dagre";
import { getCaseGraph, type CaseGraph as CaseGraphData } from "@/lib/api";

const NODE_W = 200;
const NODE_H = 56;

const TYPE_STYLE: Record<string, { bg: string; border: string; fg: string }> = {
  incident: { bg: "var(--color-primary-soft)", border: "var(--color-primary)", fg: "var(--color-fg)" },
  service: { bg: "var(--color-surface-2)", border: "var(--color-border)", fg: "var(--color-fg-muted)" },
  root_cause: { bg: "var(--color-warn-soft)", border: "var(--color-warn)", fg: "var(--color-fg)" },
  remediation: { bg: "var(--color-success-soft)", border: "var(--color-success)", fg: "var(--color-fg)" },
  other: { bg: "var(--color-surface)", border: "var(--color-border)", fg: "var(--color-fg-muted)" },
};

function layout(data: CaseGraphData): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "TB", ranksep: 60, nodesep: 30 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const n of data.nodes) g.setNode(n.id, { width: NODE_W, height: NODE_H });
  for (const e of data.edges) g.setEdge(e.source, e.target);
  dagre.layout(g);

  const nodes: Node[] = data.nodes.map((n) => {
    const pos = g.node(n.id);
    const isFocus = n.id === data.focus_id;
    const s = TYPE_STYLE[n.type] ?? TYPE_STYLE.other;
    return {
      id: n.id,
      position: { x: pos.x - NODE_W / 2, y: pos.y - NODE_H / 2 },
      data: { label: n.label, type: n.type, meta: n.meta },
      style: {
        width: NODE_W,
        padding: "8px 12px",
        background: s.bg,
        border: `${isFocus ? 2 : 1}px solid ${s.border}`,
        borderRadius: 8,
        color: s.fg,
        fontSize: 12,
        fontFamily: "var(--font-sans)",
        boxShadow: isFocus ? "0 0 0 3px var(--color-primary)/25" : undefined,
      },
      sourcePosition: "bottom" as const,
      targetPosition: "top" as const,
    };
  });

  const edges: Edge[] = data.edges.map((e, i) => ({
    id: `e-${i}-${e.source}-${e.target}`,
    source: e.source,
    target: e.target,
    label: e.label,
    labelStyle: { fontSize: 10, fill: "var(--color-fg-dim)" },
    style: { stroke: "var(--color-border)", strokeWidth: 1 },
    markerEnd: { type: MarkerType.ArrowClosed, color: "var(--color-border)" },
  }));

  return { nodes, edges };
}

export function CaseGraph({ incidentId, height = 360 }: { incidentId: string; height?: number }) {
  const [data, setData] = useState<CaseGraphData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getCaseGraph(incidentId)
      .then((g) => {
        if (!alive) return;
        setData(g);
        setLoading(false);
      })
      .catch((e: Error) => {
        if (!alive) return;
        setErr(e.message);
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [incidentId]);

  const { nodes, edges } = useMemo(() => (data ? layout(data) : { nodes: [], edges: [] }), [data]);

  const onNodeClick = useCallback((_evt: unknown, node: Node) => {
    if (node.data?.type !== "incident") return;
    const id = String(node.data?.meta?.incident_id ?? "");
    if (!id || id === incidentId) return;
    window.open(`/incident/${id}`, "_blank");
  }, [incidentId]);

  if (loading) {
    return <div style={{ height }} className="flex items-center justify-center font-mono-label text-[var(--color-fg-dim)]">loading case graph…</div>;
  }
  if (err) {
    return <div style={{ height }} className="flex items-center justify-center font-mono-label text-[var(--color-fg-dim)]">case graph unavailable: {err}</div>;
  }
  if (!data || data.nodes.length === 0) {
    return <div style={{ height }} className="flex items-center justify-center font-mono-label text-[var(--color-fg-dim)]">no prior cases yet — this incident will seed future runs</div>;
  }

  return (
    <div style={{ height }} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)]/60">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodeClick={onNodeClick}
        fitView
        proOptions={{ hideAttribution: true }}
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable
      >
        <Background gap={16} color="var(--color-border)" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
```

- [ ] **Step 2: Type check**

Run: `pnpm --filter @argus/web exec tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/case-graph.tsx
git commit -m "web: case graph react flow component"
```

---

## Task 21: RelatedCasesList component

**Files:**
- Create: `apps/web/components/related-cases-list.tsx`

- [ ] **Step 1: Write `related-cases-list.tsx`**

```tsx
"use client";
import { useEffect, useState } from "react";
import { getCaseGraph } from "@/lib/api";

interface Row {
  incidentId: string;
  label: string;
}

export function RelatedCasesList({ incidentId }: { incidentId: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    let alive = true;
    getCaseGraph(incidentId).then((g) => {
      if (!alive || !g) return;
      const cases = g.nodes
        .filter((n) => n.type === "incident" && n.id !== g.focus_id)
        .map<Row>((n) => ({
          incidentId: String(n.meta?.incident_id ?? n.id),
          label: n.label,
        }));
      setRows(cases);
    });
    return () => {
      alive = false;
    };
  }, [incidentId]);

  if (!rows || rows.length === 0) return null;

  return (
    <ul className="mt-4 space-y-2">
      {rows.map((r) => (
        <li key={r.incidentId} className="flex items-baseline gap-3">
          <span className="font-mono-label text-[var(--color-fg-dim)]">↳</span>
          <a
            href={`/incident/${r.incidentId}`}
            target="_blank"
            rel="noreferrer"
            className="text-[14.5px] font-light text-[var(--color-fg-muted)] underline-offset-4 hover:underline hover:text-[var(--color-fg)]"
          >
            {r.label}
          </a>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/components/related-cases-list.tsx
git commit -m "web: related cases list under final report"
```

---

## Task 22: Final report integration + fullscreen modal

**Files:**
- Modify: `apps/web/components/final-report.tsx`

- [ ] **Step 1: Add CaseGraph + RelatedCasesList rendering**

In `final-report.tsx`, replace the existing component signature and JSX:

```tsx
"use client";
import { useMemo, useState } from "react";
import type { StreamEvent } from "@/lib/types";
import { CaseGraph } from "./case-graph";
import { RelatedCasesList } from "./related-cases-list";

export function FinalReport({ events, incidentId }: { events: StreamEvent[]; incidentId: string }) {
  const [fullscreen, setFullscreen] = useState(false);

  const md = useMemo(() => {
    const e = [...events].reverse().find((x) => x.type === "incident_done");
    return e ? String((e.data as { report_md?: string }).report_md ?? "") : "";
  }, [events]);

  const halted = useMemo(() => /halted|incomplete/i.test(md), [md]);

  if (!md) return null;

  const sections = parseSections(md);

  return (
    <>
      <section className="rounded-xl border border-[var(--color-success)]/35 bg-[var(--color-success-soft)]/15 p-8 sm:p-10">
        <div className="mb-8 flex items-baseline justify-between gap-4">
          <div className="flex items-baseline gap-4">
            <span className="inline-flex h-7 items-center rounded-md border border-[var(--color-success)]/55 px-2 font-mono-label text-[var(--color-success)]">
              investigation complete
            </span>
            <h2 className="font-serif-display text-[26px] leading-none text-[var(--color-fg)]">Final Report</h2>
          </div>
        </div>

        <article className="space-y-9">
          {sections.map((s, i) => (
            <Section key={i} title={s.title} body={s.body} />
          ))}
        </article>

        <section className="mt-10 border-t border-[var(--color-border)] pt-6">
          <header className="mb-4 flex items-baseline justify-between gap-4">
            <h3 className="font-mono-label text-[var(--color-fg-dim)]">prior cases consulted</h3>
            <button
              type="button"
              onClick={() => setFullscreen(true)}
              className="rounded-md border border-[var(--color-border)] px-2.5 py-1 font-mono-label text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-2)]/60"
              aria-label="open case graph fullscreen"
            >
              ⛶ fullscreen
            </button>
          </header>
          <CaseGraph incidentId={incidentId} height={360} />
          <RelatedCasesList incidentId={incidentId} />
          {halted ? (
            <p className="mt-4 font-mono-label text-[var(--color-warn)]">
              halted — not auto-saved to knowledge base
            </p>
          ) : null}
        </section>
      </section>

      {fullscreen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-bg)]/85 backdrop-blur"
          onClick={() => setFullscreen(false)}
        >
          <div
            className="relative h-[90vh] w-[90vw] rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setFullscreen(false)}
              className="absolute right-3 top-3 z-10 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 font-mono-label text-[var(--color-fg-muted)]"
              aria-label="close fullscreen"
            >
              ✕ close
            </button>
            <CaseGraph incidentId={incidentId} height={undefined as unknown as number} />
          </div>
        </div>
      ) : null}
    </>
  );
}

// (Section / renderLine / renderInline / parseSections unchanged from prior version)
```

Keep the existing `Section`, `renderLine`, `renderInline`, and `parseSections` helpers below the component — do not delete them. The CaseGraph component needs a numeric `height`; for fullscreen we pass `"100%"` via CSS instead. Adjust:

In `case-graph.tsx`, change the `height` prop type to `number | string` and the wrapper `style={{ height }}` already works for both.

- [ ] **Step 2: Update CaseGraph props**

In `case-graph.tsx`, change:
```typescript
export function CaseGraph({ incidentId, height = 360 }: { incidentId: string; height?: number }) {
```

to:

```typescript
export function CaseGraph({ incidentId, height = 360 }: { incidentId: string; height?: number | string }) {
```

And update the fullscreen call in `final-report.tsx` to:
```tsx
<CaseGraph incidentId={incidentId} height="100%" />
```

- [ ] **Step 3: Pass `incidentId` from caller**

In `apps/web/app/incident/[id]/client.tsx`, find this line (around line 133):

```tsx
        <FinalReport events={events} />
```

Replace with:

```tsx
        <FinalReport events={events} incidentId={id} />
```

The `id` parameter already comes from `IncidentClient({ id }: { id: string })` (line 13), so no additional plumbing is needed.

- [ ] **Step 4: Type check + visual smoke**

Run: `pnpm --filter @argus/web exec tsc --noEmit`
Expected: 0 errors.

Visual: `pnpm dev:web` (with orchestrator + KB up + seeded), navigate to an incident page that just finished, scroll to final report. Expect the case graph to render below the markdown.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/final-report.tsx apps/web/components/case-graph.tsx apps/web/app/incident/\[id\]/client.tsx
git commit -m "web: case graph + related cases under final report"
```

---

## Task 23: Reset KB button in chaos panel

**Files:**
- Modify: `apps/web/components/chaos-panel.tsx`

- [ ] **Step 1: Add Reset KB button + confirm dialog**

Modify `chaos-panel.tsx`. Add this import:

```typescript
import { resetKB } from "@/lib/api";
```

Add a new state hook in `ChaosPanel`:

```typescript
  const [confirming, setConfirming] = useState(false);
  const [resetting, setResetting] = useState(false);

  async function onResetKB() {
    setResetting(true);
    try {
      await resetKB();
    } finally {
      setResetting(false);
      setConfirming(false);
    }
  }
```

Change the grid to 3 columns and append a third button:

```tsx
      <div className="grid gap-2 px-4 py-3 sm:grid-cols-3">
        <ChaosButton
          label="Claude"
          killed={state.claudeKilled}
          reason={state.claudeReason}
          accent="var(--color-primary)"
          pending={pending === "claude"}
          onToggle={() => onToggleProvider("claude", state.claudeKilled)}
        />
        <ChaosButton
          label="Nemotron"
          killed={state.nemoKilled}
          reason={state.nemoReason}
          accent="var(--color-shadow-prov)"
          pending={pending === "nemotron"}
          onToggle={() => onToggleProvider("nemotron", state.nemoKilled)}
        />
        <button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={resetting}
          className="group flex items-center justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)]/60 px-3 py-2.5 text-left transition-colors hover:bg-[var(--color-surface-2)]/60 disabled:cursor-not-allowed disabled:opacity-70"
        >
          <div className="flex items-center gap-3.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--color-warn)" }} />
            <div className="flex flex-col leading-tight">
              <span className="text-[15px] font-light tracking-tight text-[var(--color-fg)]">Knowledge base</span>
              <span className="font-mono-label text-[var(--color-fg-dim)]">{resetting ? "resetting…" : "stored cases"}</span>
            </div>
          </div>
          <span
            className="rounded-md px-2 py-1 font-mono text-[10px] font-medium uppercase tracking-[0.18em]"
            style={{ background: "var(--color-warn-soft)", color: "var(--color-warn)" }}
          >
            reset
          </span>
        </button>
      </div>

      {confirming ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-bg)]/80" onClick={() => setConfirming(false)}>
          <div
            className="w-[420px] rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-2 font-serif-display text-[20px] text-[var(--color-fg)]">Reset knowledge base?</h3>
            <p className="mb-5 text-[14px] font-light leading-[1.55] text-[var(--color-fg-muted)]">
              Wipe all stored incidents. Re-seed manually with <code className="rounded bg-[var(--color-bg)]/60 px-1 py-0.5 font-mono text-[12px]">pnpm seed-kb</code>. Continue?
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="rounded-md border border-[var(--color-border)] px-3 py-1.5 font-mono-label text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-2)]/60"
              >
                cancel
              </button>
              <button
                type="button"
                onClick={onResetKB}
                disabled={resetting}
                className="rounded-md border border-[var(--color-danger)]/60 bg-[var(--color-danger-soft)] px-3 py-1.5 font-mono-label text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)]/80 disabled:opacity-70"
              >
                {resetting ? "wiping…" : "wipe"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
```

- [ ] **Step 2: Type check**

Run: `pnpm --filter @argus/web exec tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Visual smoke**

`pnpm dev:web`, navigate to an incident, click Reset KB → see modal → cancel works, wipe calls orchestrator → 200, Neo4j Browser empty after.

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/chaos-panel.tsx
git commit -m "web: reset kb button with confirm dialog"
```

---

## Task 24: Reset KB CLI script

**Files:**
- Create: `scripts/reset-kb.ts`

- [ ] **Step 1: Write `scripts/reset-kb.ts`**

```typescript
#!/usr/bin/env tsx
const ORCH = process.env.NEXT_PUBLIC_ORCH_URL ?? "http://127.0.0.1:7200";

async function main(): Promise<void> {
  const r = await fetch(`${ORCH}/admin/kb/reset`, { method: "POST" });
  if (!r.ok) {
    console.error(`reset failed: ${r.status} ${await r.text()}`);
    process.exit(1);
  }
  console.log("kb wiped");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Smoke-test**

Run: `pnpm reset-kb`
Expected: `kb wiped`. Re-run `pnpm seed-kb` to restore for further dev.

- [ ] **Step 3: Commit**

```bash
git add scripts/reset-kb.ts
git commit -m "scripts: reset-kb cli"
```

---

## Task 25: End-to-end demo flow verification

**Files:**
- No new files. This is a verification task.

- [ ] **Step 1: Bring up the full stack**

In separate terminals (or use a process manager):
```bash
docker compose up -d neo4j
pnpm dev:cluster          # mock cluster on 7100-7104
pnpm dev:kb               # KB on 7300 (mcp) + 7301 (admin)
pnpm dev:orch             # orchestrator on 7200
pnpm dev:web              # web on 3000
```

Wait until KB logs `Uvicorn running on http://0.0.0.0:7301` AND orchestrator logs `[argus] incident-kb mcp connected`.

- [ ] **Step 2: Seed**

Run: `pnpm seed-kb`
Expected: `seeded 12/12 incidents`.

- [ ] **Step 3: Start a worker-oom scenario**

Open http://localhost:3000, click "worker-oom" scenario, watch the timeline.

Expected:
- One of the agent's first 3-4 steps is `read_incident_kb` (visible in timeline as `kb?` then `kb✓`).
- Timeline shows steps progressing.
- Reasoning pane shows kb lookup results in step body.

- [ ] **Step 4: Verify final report renders case graph**

When the incident resolves:
- Final report block appears.
- Below the report, "prior cases consulted" section shows a React Flow graph with the current incident + related historical incidents.
- ⛶ fullscreen toggles the modal correctly.
- Clicking a non-focus incident node opens that incident in a new tab.

- [ ] **Step 5: Verify auto-ingest fired**

After the incident resolved, timeline should show `kb+` (kb_ingest_queued).

Check Neo4j Browser → `MATCH (n {group_id:'argus_incidents'}) WHERE n.name CONTAINS 'incident' RETURN count(n)` — the count should be higher than before this run.

- [ ] **Step 6: Verify halted-incident path**

Trigger a scenario, kill both Claude and Nemotron via the chaos panel during the run → incident halts. In the final report, halt-hint `halted — not auto-saved to knowledge base` should appear and `kb_ingest_queued` should NOT fire.

- [ ] **Step 7: Verify Reset KB**

Click Reset KB → confirm → check Neo4j Browser shows `0` nodes for the group.
Restore for future demo: `pnpm seed-kb`.

- [ ] **Step 8: No commit — verification only.**

---

## Task 26: README + demo flow notes

**Files:**
- Create: `services/incident-kb/README.md`

- [ ] **Step 1: Write a short README**

```markdown
# argus-kb — Incident Knowledge Base

Graphiti-backed knowledge graph for past incident retrieval and visualization.

## Endpoints

- `:7300/mcp` — MCP server exposing `read_incident_kb(query, max_results?)`
- `:7301/health` — liveness probe
- `:7301/admin/ingest` — POST incident bundle (auto-called by orchestrator on resolved incidents)
- `:7301/admin/reset` — wipe the `argus_incidents` group
- `:7301/case-graph/:incident_id` — 2-hop subgraph in React Flow shape

## Run

1. Start Neo4j: `pnpm dev:neo4j` (from repo root)
2. Set `GEMINI_API_KEY` in `.env.local` (free tier at https://aistudio.google.com/apikey)
3. Start KB: `pnpm dev:kb`
4. Seed: `pnpm seed-kb`

First boot downloads the `all-MiniLM-L6-v2` embedding model (~80 MB). Subsequent boots are fast.

## Reset

- CLI: `pnpm reset-kb`
- UI: Reset KB button in the chaos panel on any incident page
```

- [ ] **Step 2: Commit**

```bash
git add services/incident-kb/README.md
git commit -m "kb: readme for service"
```

---

## Final verification

After all tasks complete, run the full local test suite and demo:

```bash
pnpm -r test                      # all TS tests
uv --directory services/incident-kb run pytest    # python tests
pnpm --filter @argus/web exec tsc --noEmit        # type check
```

All three must pass. Then walk through Task 25 end-to-end once more before reporting done.

---

## Notes on deviations from the spec

- **Spec section 5.2 ontology API**: Spec writes `EntityModel`/`EntityText` from `graphiti_core.nodes`/`graphiti_core.utils`. The published `graphiti-core` API uses plain Pydantic `BaseModel` subclasses passed via `entity_types={}` to `add_episode`. Plan uses the public API; if a newer Graphiti version adds the spec's helpers, adopt them.
- **Spec section 5.5 `read_incident_kb` graph_context**: Spec returns rich `graph_context` from the tool call. Plan returns `{nodes: [], edges: []}` (empty) for v1 — Graphiti's `.search` does not return a subgraph by default. The case-graph endpoint serves the graph view separately, which is the primary consumption path. Backfilling `graph_context` from the search hits is a v2 enhancement.
- **Spec event `kb_ingest_complete`**: Deferred to v2 per spec section 7 (requires webhook or polling).
- **No e2e test of the live agent calling `read_incident_kb`**: The agent's behavior depends on LLM judgment; integration is verified by manual demo walkthrough in Task 25, not by a deterministic test. Adding a recorded-cassette test of the conductor + a mock KB tool is a worthwhile follow-up but out of scope here.
