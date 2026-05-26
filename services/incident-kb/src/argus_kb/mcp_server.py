"""MCP server exposing read_incident_kb over HTTP (streamable transport).

Stands up alongside the admin API. The orchestrator connects via
StreamableHTTPClientTransport to http://localhost:7300/mcp.
"""
from __future__ import annotations

import logging
from typing import Any

from mcp.server.fastmcp import FastMCP

from argus_kb.case_graph import EPISODE_PREFIX
from argus_kb.config import settings
from argus_kb.graph import get_graphiti, get_neo4j_driver

log = logging.getLogger(__name__)

mcp = FastMCP("argus-incident-kb", host="0.0.0.0", port=settings.mcp_port)


@mcp.tool()
async def read_incident_kb(query: str, max_results: int = 5) -> dict[str, Any]:
    """Search the incident knowledge graph for cases relevant to the query.

    Returns: { incidents: [{incident_id, title, relevance, relation_path, summary, url}], graph_context: {nodes, edges} }

    graphiti's search returns EntityEdge hits that point to *entity* nodes
    (Service, RootCause, etc.), not to incidents. We resolve each entity back
    to the Episodic node(s) that mention it, since the Episodic name is the
    deterministic ``incident:<id>`` anchor written at ingest time. That keeps
    the surface IDs aligned with what the rest of the app uses.
    """
    g = await get_graphiti()
    # Fetch more raw edge hits than requested so the post-dedup result still
    # has enough distinct incidents to fill ``max_results``.
    hits = await g.search(
        query=query,
        group_ids=[settings.graphiti_group_id],
        num_results=max(max_results * 3, 10),
    )
    if not hits:
        return {"incidents": [], "graph_context": {"nodes": [], "edges": []}}

    entity_uuids: list[str] = []
    seen_uuids: set[str] = set()
    for h in hits:
        for attr in ("source_node_uuid", "target_node_uuid"):
            uuid = getattr(h, attr, None)
            if uuid and uuid not in seen_uuids:
                seen_uuids.add(uuid)
                entity_uuids.append(uuid)

    if not entity_uuids:
        return {"incidents": [], "graph_context": {"nodes": [], "edges": []}}

    driver = await get_neo4j_driver()
    cypher = """
    MATCH (e:Episodic)-[:MENTIONS]->(n)
    WHERE n.uuid IN $uuids AND e.group_id = $gid AND e.name STARTS WITH $prefix
    RETURN n.uuid AS entity_uuid, e.name AS episode_name, e.content AS content
    """
    async with driver.session() as session:
        result = await session.run(
            cypher,
            uuids=entity_uuids,
            gid=settings.graphiti_group_id,
            prefix=EPISODE_PREFIX,
        )
        records = [dict(r) async for r in result]

    entity_to_incidents: dict[str, list[tuple[str, str]]] = {}
    for rec in records:
        episode_name = rec.get("episode_name") or ""
        if not episode_name.startswith(EPISODE_PREFIX):
            continue
        incident_id = episode_name[len(EPISODE_PREFIX):]
        title = _extract_title(rec.get("content") or "") or incident_id
        entity_to_incidents.setdefault(rec["entity_uuid"], []).append((incident_id, title))

    # Walk the search hits in original order; first occurrence wins so
    # relevance ranking mirrors graphiti's ordering even when its score
    # attribute is unset (which it often is for EntityEdge results).
    ranked: list[dict[str, Any]] = []
    seen_incidents: set[str] = set()
    for h in hits:
        fact = str(getattr(h, "fact", None) or getattr(h, "name", "") or "")
        for attr in ("source_node_uuid", "target_node_uuid"):
            uuid = getattr(h, attr, None)
            if not uuid:
                continue
            for incident_id, title in entity_to_incidents.get(uuid, []):
                if incident_id in seen_incidents:
                    continue
                seen_incidents.add(incident_id)
                ranked.append({
                    "incident_id": incident_id,
                    "title": title,
                    "relevance": float(getattr(h, "score", 0.0) or 0.0),
                    "relation_path": "semantic match",
                    "summary": (fact or title)[:280],
                    "url": f"/incident/{incident_id}",
                })
                if len(ranked) >= max_results:
                    return {"incidents": ranked, "graph_context": {"nodes": [], "edges": []}}

    return {"incidents": ranked, "graph_context": {"nodes": [], "edges": []}}


def _extract_title(content: str) -> str:
    """Pull the ``title=`` metadata line out of an episode body."""
    for line in content.splitlines():
        if line.startswith("title="):
            return line[len("title="):].strip()
        if line.strip() == "---":
            return ""
    return ""


def run_mcp() -> None:
    mcp.run(transport="streamable-http")
