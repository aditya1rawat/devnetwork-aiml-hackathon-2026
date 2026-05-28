# Incident Knowledge Base: FastAPI admin API on 7301 + MCP server on 7300.
# Heaviest image in the stack — graphiti-core, neo4j driver, and
# sentence-transformers pull a couple hundred MB of dependencies + a small
# embedding model. The image bakes the venv at /app/.venv so subsequent
# rebuilds are layer-cached.
FROM python:3.13-slim AS base

RUN pip install --no-cache-dir uv

WORKDIR /app

# Resolve + install dependencies first (against the lockfile), so editing
# source code doesn't bust the dep layer.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY src ./src

# Project install (cheap layer, runs every time source changes).
RUN uv sync --frozen --no-dev

# Pre-download the sentence-transformer model so first request doesn't pay
# the ~80MB download. Resolves to the same model used by LocalEmbedder.
RUN /app/.venv/bin/python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('sentence-transformers/all-MiniLM-L6-v2')"

ENV PATH="/app/.venv/bin:$PATH"

# 7300 = MCP server (orchestrator connects here); 7301 = admin REST API
EXPOSE 7300 7301
CMD ["argus-kb"]
