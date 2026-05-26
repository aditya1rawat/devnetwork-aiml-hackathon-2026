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
    "Episodic": "incident",  # the deterministic incident anchor (name="incident:<id>")
    "Incident": "incident",
    "Service": "service",
    "RootCause": "root_cause",
    "Remediation": "remediation",
}

EPISODE_PREFIX = "incident:"

EDGE_LABEL = {
    "INVOLVES": "involves",
    "CAUSED_BY": "caused by",
    "REMEDIATED_BY": "remediated by",
    "PRECEDED_BY": "preceded by",
    "MENTIONS": "mentions",
    "RELATES_TO": "relates to",
}


def _jsonable(v: Any) -> Any:
    """Coerce Neo4j-native types (DateTime, etc.) to JSON-serializable values."""
    if isinstance(v, (str, int, float, bool)) or v is None:
        return v
    if isinstance(v, list):
        return [_jsonable(x) for x in v]
    if isinstance(v, dict):
        return {k: _jsonable(x) for k, x in v.items()}
    return str(v)


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
        is_episode = "Episodic" in labels
        name = props.get("name") or ""
        # Episode nodes are named "incident:<id>"; derive the id + a clean label.
        incident_id = name[len(EPISODE_PREFIX):] if is_episode and name.startswith(EPISODE_PREFIX) else attrs.get("incident_id")
        label = (
            props.get("title")
            or attrs.get("title")
            or (incident_id if is_episode else None)
            or name
            or props.get("summary")
            or "untitled"
        )
        meta = _jsonable({**props, **attrs})
        if incident_id:
            meta["incident_id"] = incident_id
        nodes_out.append({
            "id": n["id"],
            "type": typed,
            "label": label,
            "meta": meta,
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
    """Walk 2 hops out from the incident's Episodic anchor.

    The Episodic node is named "incident:<id>" deterministically at ingest,
    unlike extracted Incident entities whose names vary by LLM. Anchoring here
    makes lookups reliable; 2 hops reaches mentioned entities and, through
    shared services/causes, neighboring incidents.
    """
    driver = await get_neo4j_driver()
    cypher = """
    MATCH (i:Episodic {name: $episode_name, group_id: $group_id})
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
            episode_name=f"{EPISODE_PREFIX}{incident_id}",
            group_id=settings.graphiti_group_id,
        )
        record = await result.single()
        if record is None:
            return {"nodes": [], "edges": [], "focus_id": ""}
        return shape_for_react_flow(record["rn"], record["re"], record["focus_id"])
