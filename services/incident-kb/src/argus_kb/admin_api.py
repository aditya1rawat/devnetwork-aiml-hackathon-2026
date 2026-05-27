import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from argus_kb.case_graph import fetch_case_subgraph
from argus_kb.graph import clear_group, close_all, get_graphiti, get_neo4j_driver
from argus_kb.ingest import IncidentBundle, build_episode_body, schedule_ingest
from argus_kb.config import settings
from argus_kb.report import fetch_incident_report

log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Pre-warm Graphiti + embedding model so the first request is fast.
    await get_graphiti()
    yield
    await close_all()


app = FastAPI(title="argus-kb-admin", lifespan=lifespan)


@app.get("/health")
async def health() -> dict[str, bool]:
    return {"ok": True}


@app.post("/admin/ingest")
async def admin_ingest(bundle: IncidentBundle) -> dict[str, str]:
    try:
        job_id = schedule_ingest(bundle)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"job_id": job_id, "status": "queued"}


@app.post("/admin/reset")
async def admin_reset() -> dict[str, bool]:
    await clear_group()
    return {"ok": True}


@app.get("/case-graph/{incident_id}")
async def case_graph(incident_id: str) -> dict:
    subgraph = await fetch_case_subgraph(incident_id)
    if not subgraph["nodes"]:
        raise HTTPException(status_code=404, detail=f"incident {incident_id} not found in graph")
    return subgraph


@app.post("/admin/incident/{incident_id}/refresh-content")
async def refresh_episode_content(incident_id: str, bundle: IncidentBundle) -> dict:
    """Replace an existing Episodic node's content + metadata in place.

    Lets us iterate on the markdown the archive view displays without
    re-running graphiti's entity extraction (slow + LLM-billed) or
    perturbing the entity graph that search and case_graph depend on. The
    Episodic node already exists from the original ingest; we only update
    the human-readable surface.
    """
    name = f"incident:{incident_id}"
    body = build_episode_body(bundle)
    driver = await get_neo4j_driver()
    cypher = """
    MATCH (e:Episodic {name: $name, group_id: $gid})
    SET e.content = $content, e.provenance = coalesce(e.provenance, $provenance)
    RETURN count(e) AS updated
    """
    async with driver.session() as session:
        result = await session.run(
            cypher,
            name=name,
            gid=settings.graphiti_group_id,
            content=body,
            provenance=bundle.provenance,
        )
        record = await result.single()
    updated = record["updated"] if record else 0
    if updated == 0:
        raise HTTPException(status_code=404, detail=f"no Episodic for {incident_id}")
    return {"updated": updated}


@app.delete("/admin/incident/{incident_id}")
async def delete_incident(incident_id: str) -> dict:
    """Remove a single incident's Episodic anchor from the graph.

    Only the Episodic node + its relationships are detached; extracted entity
    nodes are left in place because they may be shared with other incidents
    (e.g. a duplicate run touching the same services). Returns how many anchors
    were removed (0 if the id was not present).
    """
    name = f"incident:{incident_id}"
    driver = await get_neo4j_driver()
    cypher = """
    MATCH (e:Episodic {name: $name, group_id: $gid})
    WITH e, count(e) AS _c
    DETACH DELETE e
    RETURN _c AS deleted
    """
    async with driver.session() as session:
        result = await session.run(cypher, name=name, gid=settings.graphiti_group_id)
        record = await result.single()
    deleted = record["deleted"] if record else 0
    return {"deleted": deleted}


@app.get("/incidents")
async def list_incidents(provenance: str | None = None) -> dict:
    """List incidents in the KB, optionally filtered by provenance.

    Used by the incidents page to surface historical (pre-Argus) cases that
    never had an in-memory run on the orchestrator.
    """
    driver = await get_neo4j_driver()
    base_match = "MATCH (e:Episodic {group_id: $gid}) WHERE e.name STARTS WITH 'incident:'"
    if provenance is not None:
        base_match += " AND e.provenance = $provenance"
    cypher = f"""
    {base_match}
    RETURN
      substring(e.name, size('incident:')) AS incident_id,
      e.content AS content,
      toString(e.valid_at) AS valid_at,
      toString(e.created_at) AS created_at,
      e.provenance AS provenance
    ORDER BY e.created_at DESC
    """
    async with driver.session() as session:
        result = await session.run(cypher, gid=settings.graphiti_group_id, provenance=provenance)
        records = [dict(r) async for r in result]

    from argus_kb.report import _split_body

    items: list[dict] = []
    for r in records:
        meta, _ = _split_body(r.get("content") or "")
        items.append({
            "incident_id": r["incident_id"],
            "title": meta.get("title") or r["incident_id"],
            "severity": meta.get("severity"),
            "scenario": meta.get("scenario"),
            "failed_over": meta.get("failed_over"),
            "services_touched": meta.get("services_touched") or [],
            "resolved_at": meta.get("resolved_at") or r.get("valid_at"),
            "provenance": r["provenance"] or "argus",
        })
    return {"incidents": items}


@app.get("/incident/{incident_id}/report")
async def incident_report(incident_id: str) -> dict:
    report = await fetch_incident_report(incident_id)
    if report is None:
        raise HTTPException(status_code=404, detail=f"incident {incident_id} not in knowledge base")
    return report


class BackfillRequest(BaseModel):
    # Incident ids treated as pre-Argus history. Anything not in this list
    # (and lacking a provenance tag) is marked "argus".
    historical: list[str]


@app.post("/admin/backfill-provenance")
async def admin_backfill_provenance(req: BackfillRequest) -> dict:
    """One-shot tagger for KB rows ingested before provenance existed.

    Splits the existing untagged Episodic nodes into the caller-specified
    historical set and an implicit Argus set (everything else). Idempotent:
    nodes already carrying a provenance value are left alone.
    """
    historical_names = [f"incident:{i}" for i in req.historical]
    driver = await get_neo4j_driver()
    cypher = """
    MATCH (e:Episodic {group_id: $gid})
    WHERE e.name STARTS WITH 'incident:' AND e.provenance IS NULL
    WITH e, CASE WHEN e.name IN $historical THEN 'historical' ELSE 'argus' END AS prov
    SET e.provenance = prov
    RETURN e.name AS name, prov AS provenance
    """
    async with driver.session() as session:
        result = await session.run(cypher, gid=settings.graphiti_group_id, historical=historical_names)
        records = [dict(r) async for r in result]
    return {
        "tagged": len(records),
        "historical": sum(1 for r in records if r["provenance"] == "historical"),
        "argus": sum(1 for r in records if r["provenance"] == "argus"),
    }
