import uvicorn

from argus_kb.config import settings


def main() -> None:
    uvicorn.run(
        "argus_kb.admin_api:app",
        host="0.0.0.0",
        port=settings.admin_port,
        log_level="info",
    )


if __name__ == "__main__":
    main()
