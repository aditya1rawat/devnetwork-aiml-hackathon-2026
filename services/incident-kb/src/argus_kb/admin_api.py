from fastapi import FastAPI

app = FastAPI(title="argus-kb-admin")


@app.get("/health")
async def health() -> dict[str, bool]:
    return {"ok": True}
