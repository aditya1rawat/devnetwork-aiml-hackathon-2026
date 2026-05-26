"""MCP server exposing read_incident_kb over HTTP (streamable transport).

Stands up alongside the admin API. The orchestrator connects via
StreamableHTTPClientTransport to http://localhost:7300/mcp.
"""
from __future__ import annotations

import logging
from typing import Any

from mcp.server.fastmcp import FastMCP

from argus_kb.config import settings
from argus_kb.graph import get_graphiti

log = logging.getLogger(__name__)

mcp = FastMCP("argus-incident-kb", host="0.0.0.0", port=settings.mcp_port)


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
        # graphiti search returns EntityEdge objects; attrs vary by version.
        fact = getattr(h, "fact", None) or getattr(h, "name", "") or ""
        score = float(getattr(h, "score", 0.0) or 0.0)
        source = getattr(h, "source_node_uuid", None) or getattr(h, "uuid", "") or ""
        incidents.append({
            "incident_id": source,
            "title": str(fact)[:140],
            "relevance": score,
            "relation_path": "semantic match",
            "summary": str(fact)[:280],
            "url": f"/incident/{source}",
        })

    return {
        "incidents": incidents,
        "graph_context": {"nodes": [], "edges": []},
    }


def run_mcp() -> None:
    mcp.run(transport="streamable-http")
