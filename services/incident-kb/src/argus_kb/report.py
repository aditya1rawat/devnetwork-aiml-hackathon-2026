"""Fetch a previously-ingested incident's stored episode content.

The Episodic node stores the full bundle body (metadata key=value lines + a
``---`` separator + the report markdown). This module reads it back, parses
out the structured metadata, and returns a shape the web archive view can
render without re-running the LLM.
"""
from __future__ import annotations

from typing import Any

from argus_kb.case_graph import EPISODE_PREFIX
from argus_kb.config import settings
from argus_kb.graph import get_neo4j_driver


async def fetch_incident_report(incident_id: str) -> dict[str, Any] | None:
    """Return the stored bundle for ``incident_id``, or None if not in the KB.

    Returns the freshest episode if multiple share the same name (older
    versions of the same incident_id should never exist in practice, but the
    ``ORDER BY`` keeps us deterministic).
    """
    driver = await get_neo4j_driver()
    cypher = """
    MATCH (e:Episodic {name: $name, group_id: $group_id})
    RETURN
      e.content AS content,
      toString(e.valid_at) AS valid_at,
      toString(e.created_at) AS created_at,
      e.source_description AS source_description,
      e.provenance AS provenance
    ORDER BY e.created_at DESC
    LIMIT 1
    """
    name = f"{EPISODE_PREFIX}{incident_id}"
    async with driver.session() as session:
        result = await session.run(cypher, name=name, group_id=settings.graphiti_group_id)
        record = await result.single()
        if record is None:
            return None
        content = record["content"] or ""
        meta, report_md = _split_body(content)
        meta["incident_id"] = incident_id
        meta["valid_at"] = record["valid_at"]
        meta["created_at"] = record["created_at"]
        meta["source_description"] = record["source_description"]
        meta["provenance"] = record["provenance"] or "argus"
        return {**meta, "report_md": report_md}


def _split_body(content: str) -> tuple[dict[str, Any], str]:
    """Parse the episode body produced by ``build_episode_body`` in ingest.py.

    Body shape:
        incident_id=...
        title=...
        ...
        ---
        # markdown...
    """
    head, sep, tail = content.partition("\n---\n")
    if not sep:
        return ({}, content.strip())
    meta: dict[str, Any] = {}
    for line in head.splitlines():
        if "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip()
        if key == "services_touched":
            meta[key] = [s for s in value.split(",") if s and s != "none"]
        elif key == "failed_over":
            meta[key] = value == "true"
        elif key == "scenario":
            meta[key] = None if value == "none" else value
        else:
            meta[key] = value
    return (meta, tail.strip())
