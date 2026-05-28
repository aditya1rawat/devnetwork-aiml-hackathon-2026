"""Convert an incident bundle into a Graphiti episode and submit it."""
from __future__ import annotations

import asyncio
import contextvars
import logging
import os
import time
import uuid
from datetime import datetime, timezone

from graphiti_core.llm_client.errors import RateLimitError
from graphiti_core.nodes import EpisodeType
from pydantic import BaseModel

from argus_kb.config import settings
from argus_kb.graph import get_graphiti, get_neo4j_driver
from argus_kb.ontology import ENTITY_TYPES

log = logging.getLogger(__name__)


# Per-incident ingest job state. Keyed by incident_id (not job_id) so the
# UI can poll status with just the incident id even after a restart loses
# the original job_id. Latest job wins on re-ingest.
_JOB_STATE: dict[str, dict] = {}
# ContextVar set inside _run_ingest so the rate-limited LLM client can
# attribute each extraction call to the right job without an explicit handle.
_CURRENT_INCIDENT: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "current_incident_id", default=None
)


def record_extraction_call() -> None:
    """Bump the active incident's extraction-call counter. Called by the
    rate-limited Graphiti LLM client after each successful generation."""
    iid = _CURRENT_INCIDENT.get()
    if not iid:
        return
    state = _JOB_STATE.get(iid)
    if state is None:
        return
    state["extraction_calls"] = state.get("extraction_calls", 0) + 1


def get_job_state(incident_id: str) -> dict | None:
    state = _JOB_STATE.get(incident_id)
    if state is None:
        return None
    out = dict(state)
    if state.get("state") == "running" and state.get("started_at"):
        out["elapsed_s"] = max(0.0, time.time() - state["started_at"])
    elif state.get("started_at") and state.get("finished_at"):
        out["elapsed_s"] = max(0.0, state["finished_at"] - state["started_at"])
    return out

VALID_SEVERITIES = {"sev1", "sev2", "sev3"}
_RATE_LIMIT_RETRIES = 6
_RATE_LIMIT_BACKOFF_S = 20.0
# Gap between incidents so the provider's per-minute window fully clears
# before the next incident's burst of extraction calls.
_INTER_INCIDENT_DELAY_S = 15.0


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
    # Structured linking facts. When present, the extractor sees these (compact,
    # few entities) instead of the full report — keeping ingest under the
    # provider RPM limit. Optional so seeds / older callers still validate.
    root_cause: str = ""
    symptom: str = ""
    summary: str = ""
    # "argus" = investigated live by this system, full event log exists.
    # "historical" = pre-Argus case, only the report + entity graph survive.
    provenance: str = "argus"


def validate_bundle(b: IncidentBundle) -> None:
    if b.severity not in VALID_SEVERITIES:
        raise ValueError(f"severity must be one of {VALID_SEVERITIES}, got {b.severity!r}")
    if not b.incident_id:
        raise ValueError("incident_id required")
    if not b.report_md.strip():
        raise ValueError("report_md cannot be empty")


# Cap the report text fed to the extractor. Graphiti only needs the salient
# linking entities (service, root cause, remediation, symptom) to connect this
# incident to others — not the full multi-section postmortem. The whole report
# explodes extraction into ~100 LLM calls and trips the provider RPM limit; a
# compact slice keeps it to ~10-15 calls. The FULL report is stored separately
# on the Episodic node (e.report_md) for retrieval, so nothing is lost.
_EXTRACTION_REPORT_CHARS = int(os.getenv("EXTRACTION_REPORT_CHARS", "700"))


def build_episode_body(b: IncidentBundle) -> str:
    """Compose the COMPACT episode body shown to Graphiti's extractor.

    We feed only the salient linking facts (service, root cause, symptom,
    severity) — the entities that connect this incident to others. Graphiti
    extracts ~4 clean nodes from this instead of mining ~100 from the full
    prose report, keeping ingest under the provider RPM limit. The full report
    is stored separately on the Episodic node (e.report_md) for retrieval.

    Falls back to a truncated report when structured facts are absent (e.g.
    seeds / older callers).
    """
    if b.summary or b.root_cause:
        gist = "\n".join(filter(None, [
            f"root_cause={b.root_cause}" if b.root_cause else "",
            f"symptom={b.symptom}" if b.symptom else "",
            b.summary.strip(),
        ]))
    else:
        report = b.report_md.strip()
        gist = (
            report[:_EXTRACTION_REPORT_CHARS].rstrip() + "\n…(truncated; full report stored separately)"
            if len(report) > _EXTRACTION_REPORT_CHARS
            else report
        )
    lines = [
        f"incident_id={b.incident_id}",
        f"title={b.title}",
        f"severity={b.severity}",
        f"failed_over={'true' if b.failed_over else 'false'}",
        f"scenario={b.scenario or 'none'}",
        f"resolved_at={b.resolved_at}",
        f"services_touched={','.join(b.services_touched) if b.services_touched else 'none'}",
        "---",
        gist,
    ]
    return "\n".join(lines)


_queue: "asyncio.Queue[tuple[IncidentBundle, str]] | None" = None
_worker_task: asyncio.Task | None = None


def _ensure_worker() -> "asyncio.Queue[tuple[IncidentBundle, str]]":
    global _queue, _worker_task
    if _queue is None:
        _queue = asyncio.Queue()
    if _worker_task is None or _worker_task.done():
        _worker_task = asyncio.create_task(_worker())
    return _queue


async def _worker() -> None:
    """Process ingests strictly one at a time.

    Concurrent ingests saturate the extraction provider's per-minute window
    and starve each other into endless retries. Serializing lets the window
    drain between incidents so each extraction completes.
    """
    assert _queue is not None
    while True:
        bundle, job_id = await _queue.get()
        try:
            await _run_ingest(bundle, job_id)
        except Exception as e:  # worker must never die
            log.error("worker error on %s job=%s: %s", bundle.incident_id, job_id, e)
        finally:
            _queue.task_done()
        if not _queue.empty():
            await asyncio.sleep(_INTER_INCIDENT_DELAY_S)


def schedule_ingest(b: IncidentBundle) -> str:
    """Validate synchronously, then enqueue for the single-worker pipeline.

    Returns a job id immediately so the HTTP caller never blocks on the
    (slow, rate-limited) graphiti extraction. Validation errors still surface
    to the caller because they are raised before scheduling.
    """
    validate_bundle(b)
    job_id = f"ingest-{uuid.uuid4().hex[:12]}"
    _JOB_STATE[b.incident_id] = {
        "job_id": job_id,
        "incident_id": b.incident_id,
        "state": "queued",
        "started_at": None,
        "finished_at": None,
        "extraction_calls": 0,
        "last_error": None,
    }
    queue = _ensure_worker()
    queue.put_nowait((b, job_id))
    return job_id


async def _set_episode_provenance(episode_name: str, provenance: str) -> None:
    """Tag the freshest Episodic node sharing ``episode_name`` with the given provenance."""
    driver = await get_neo4j_driver()
    cypher = """
    MATCH (e:Episodic {name: $name, group_id: $gid})
    WITH e ORDER BY e.created_at DESC LIMIT 1
    SET e.provenance = $provenance
    """
    async with driver.session() as session:
        await session.run(cypher, name=episode_name, gid=settings.graphiti_group_id, provenance=provenance)


async def _set_episode_report(episode_name: str, report_md: str) -> None:
    """Store the FULL report on the Episodic node for retrieval. The extractor
    only saw a truncated slice, so the complete postmortem lives here."""
    driver = await get_neo4j_driver()
    cypher = """
    MATCH (e:Episodic {name: $name, group_id: $gid})
    WITH e ORDER BY e.created_at DESC LIMIT 1
    SET e.report_md = $report
    """
    async with driver.session() as session:
        await session.run(cypher, name=episode_name, gid=settings.graphiti_group_id, report=report_md)


async def _run_ingest(b: IncidentBundle, job_id: str) -> None:
    g = await get_graphiti()
    name = f"incident:{b.incident_id}"
    body = build_episode_body(b)
    reference_time = datetime.fromisoformat(b.resolved_at.replace("Z", "+00:00"))
    if reference_time.tzinfo is None:
        reference_time = reference_time.replace(tzinfo=timezone.utc)

    state = _JOB_STATE.setdefault(b.incident_id, {
        "job_id": job_id, "incident_id": b.incident_id, "state": "queued",
        "started_at": None, "finished_at": None, "extraction_calls": 0, "last_error": None,
    })
    state["state"] = "running"
    state["started_at"] = time.time()
    token = _CURRENT_INCIDENT.set(b.incident_id)

    try:
        for attempt in range(_RATE_LIMIT_RETRIES):
            try:
                await g.add_episode(
                    name=name,
                    episode_body=body,
                    source_description="argus-final-report",
                    source=EpisodeType.text,
                    reference_time=reference_time,
                    group_id=settings.graphiti_group_id,
                    entity_types=ENTITY_TYPES,
                )
                # graphiti's add_episode owns Episodic node creation, so we tag
                # provenance separately afterward. Lets the report endpoint /
                # archive view distinguish Argus-resolved vs pre-Argus cases
                # without parsing it out of the body string.
                await _set_episode_provenance(name, b.provenance)
                await _set_episode_report(name, b.report_md)
                state["state"] = "done"
                state["finished_at"] = time.time()
                log.info("ingest done: incident=%s job=%s provenance=%s", b.incident_id, job_id, b.provenance)
                return
            except Exception as e:
                transient = isinstance(e, RateLimitError) or any(
                    tok in str(e).lower() for tok in ("503", "unavailable", "overload", "rate limit", "429")
                )
                if attempt == _RATE_LIMIT_RETRIES - 1 or not transient:
                    state["state"] = "failed"
                    state["finished_at"] = time.time()
                    state["last_error"] = str(e)[:240]
                    log.error("ingest failed for %s job=%s: %s", b.incident_id, job_id, e)
                    return
                wait = _RATE_LIMIT_BACKOFF_S * (attempt + 1)
                log.warning("transient error on %s, retry %d after %.0fs: %s", b.incident_id, attempt + 1, wait, str(e)[:80])
                await asyncio.sleep(wait)
    finally:
        _CURRENT_INCIDENT.reset(token)
