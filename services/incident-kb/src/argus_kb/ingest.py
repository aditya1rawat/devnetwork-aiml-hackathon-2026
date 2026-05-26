"""Convert an incident bundle into a Graphiti episode and submit it."""
from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime, timezone

from graphiti_core.llm_client.errors import RateLimitError
from graphiti_core.nodes import EpisodeType
from pydantic import BaseModel

from argus_kb.config import settings
from argus_kb.graph import get_graphiti, get_neo4j_driver
from argus_kb.ontology import ENTITY_TYPES

log = logging.getLogger(__name__)

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

    Concurrent ingests saturate Gemini's per-minute window and starve each
    other into endless retries. Serializing lets the window drain between
    incidents so each extraction completes.
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


async def _run_ingest(b: IncidentBundle, job_id: str) -> None:
    g = await get_graphiti()
    name = f"incident:{b.incident_id}"
    body = build_episode_body(b)
    reference_time = datetime.fromisoformat(b.resolved_at.replace("Z", "+00:00"))
    if reference_time.tzinfo is None:
        reference_time = reference_time.replace(tzinfo=timezone.utc)

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
            log.info("ingest done: incident=%s job=%s provenance=%s", b.incident_id, job_id, b.provenance)
            return
        except Exception as e:
            # Retry transient provider errors: 429 rate limit and 503/overload
            # spikes both clear on their own. Validation already ran, so any
            # error here is from the LLM call.
            transient = isinstance(e, RateLimitError) or any(
                tok in str(e).lower() for tok in ("503", "unavailable", "overload", "rate limit", "429")
            )
            if attempt == _RATE_LIMIT_RETRIES - 1 or not transient:
                log.error("ingest failed for %s job=%s: %s", b.incident_id, job_id, e)
                return
            wait = _RATE_LIMIT_BACKOFF_S * (attempt + 1)
            log.warning("transient error on %s, retry %d after %.0fs: %s", b.incident_id, attempt + 1, wait, str(e)[:80])
            await asyncio.sleep(wait)
