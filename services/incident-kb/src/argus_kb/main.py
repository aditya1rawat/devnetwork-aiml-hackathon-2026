import logging
import multiprocessing as mp
from pathlib import Path

# Load .env.local into the process env BEFORE anything imports graphiti_core —
# it reads SEMAPHORE_LIMIT (concurrency cap) once at import. uv run does not
# auto-load the env file, and pydantic only reads it for Settings fields, so
# os.getenv (graphiti's SEMAPHORE_LIMIT, our EXTRACTION_RPM_LIMIT) would
# otherwise see None. Spawned children re-import this module, so they get it too.
#
# In dev the file lives 4 dirs above this module (repo root); in Docker the
# package is installed at /app/src/argus_kb/main.py and the env is supplied
# by `env_file:` in docker-compose, so .env.local won't exist. Either way is
# fine — load_dotenv is a no-op if the path is missing.
from dotenv import load_dotenv

try:
    _env_path = Path(__file__).resolve().parents[4] / ".env.local"
except IndexError:
    _env_path = None
if _env_path is not None:
    load_dotenv(_env_path)

import uvicorn

from argus_kb.config import settings


def _run_admin() -> None:
    # Spawned child process: re-init logging so module INFO logs (ingest
    # progress) are visible, not just uvicorn's own output.
    logging.basicConfig(level=logging.INFO)
    uvicorn.run(
        "argus_kb.admin_api:app",
        host="0.0.0.0",
        port=settings.admin_port,
        log_level="info",
    )


def _run_mcp() -> None:
    logging.basicConfig(level=logging.INFO)
    from argus_kb.mcp_server import run_mcp

    run_mcp()


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    procs = [
        mp.Process(target=_run_admin, daemon=False),
        mp.Process(target=_run_mcp, daemon=False),
    ]
    for p in procs:
        p.start()
    try:
        for p in procs:
            p.join()
    except KeyboardInterrupt:
        for p in procs:
            p.terminate()
        for p in procs:
            p.join()


if __name__ == "__main__":
    main()
