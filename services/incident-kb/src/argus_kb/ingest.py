"""Convert an incident bundle into a Graphiti episode and submit it."""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone

from graphiti_core.nodes import EpisodeType
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
        source=EpisodeType.text,
        reference_time=reference_time,
        group_id=settings.graphiti_group_id,
        entity_types=ENTITY_TYPES,
    )
    log.info("ingest queued: incident=%s job=%s", b.incident_id, job_id)
    return job_id
