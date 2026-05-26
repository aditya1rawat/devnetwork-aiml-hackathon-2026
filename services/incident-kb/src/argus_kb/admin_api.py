import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException

from argus_kb.graph import clear_group, close_all, get_graphiti
from argus_kb.ingest import IncidentBundle, ingest_bundle

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
        job_id = await ingest_bundle(bundle)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"job_id": job_id, "status": "queued"}


@app.post("/admin/reset")
async def admin_reset() -> dict[str, bool]:
    await clear_group()
    return {"ok": True}
