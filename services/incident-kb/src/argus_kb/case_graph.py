"""Fetch a 2-hop subgraph around an incident node and shape it for React Flow.

graphiti stores custom entity_type fields either flat on the node or nested
under an `attributes` map depending on version, so the label resolver checks
both. The canonical entity name always lives in `name`.
"""
from __future__ import annotations

import json
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


def _attrs(props: dict[str, Any]) -> dict[str, Any]:
    raw = props.get("attributes")
    if isinstance(raw, str):
        try:
            return json.loads(raw)
        except (ValueError, TypeError):
            return {}
    if isinstance(raw, dict):
        return raw
    return {}


def shape_for_react_flow(
    raw_nodes: list[dict[str, Any]],
    raw_edges: list[dict[str, Any]],
    focus_neo4j_id: str,
) -> dict[str, Any]:
    nodes_out = []
    for n in raw_nodes:
        labels: list[str] = n.get("labels") or []
        props: dict[str, Any] = n.get("props") or {}
        attrs = _attrs(props)
        typed = next((LABEL_TO_TYPE[l] for l in labels if l in LABEL_TO_TYPE), "other")
        label = (
            props.get("title")
            or attrs.get("title")
            or props.get("name")
            or props.get("summary")
            or attrs.get("incident_id")
            or "untitled"
        )
        nodes_out.append({
            "id": n["id"],
            "type": typed,
            "label": label,
            "meta": {**props, **attrs},
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
    """Walk 2 hops out from the incident node whose name == incident_id."""
    driver = await get_neo4j_driver()
    cypher = """
    MATCH (i {name: $incident_id, group_id: $group_id})
    CALL apoc.path.subgraphAll(i, {maxLevel: 2})
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
