import logging
import multiprocessing as mp

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
