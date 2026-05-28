# Orchestrator container: Node 22 + pnpm workspace. Bundles the @argus/mcp
# package alongside so the orchestrator's stdio-spawned MCP children
# (`pnpm --filter @argus/mcp logs|metrics|traces|runbook`) resolve from the
# same workspace.
#
# Built from the REPO ROOT, not from this directory:
#   docker build -f apps/orchestrator/Dockerfile -t argus-orch:test .
# This lets the COPY commands reach pnpm-workspace.yaml, root package.json,
# and the mcp/ sibling package.
FROM node:22-slim AS base
RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

# --- Dependency layer ---------------------------------------------------
# Copy only manifests first, so source edits don't bust the (slow) install.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/orchestrator/package.json ./apps/orchestrator/package.json
COPY mcp/package.json ./mcp/package.json

# We need devDependencies (tsx, typescript) at runtime because we run
# straight from .ts via tsx. --frozen-lockfile keeps the install reproducible.
RUN pnpm install --frozen-lockfile --filter "@argus/orchestrator..." --filter "@argus/mcp..."

# --- Source layer -------------------------------------------------------
COPY apps/orchestrator ./apps/orchestrator
COPY mcp ./mcp

# Working directory stays at workspace root because mcp-stdio.ts spawns
# `pnpm --filter @argus/mcp …` which only resolves from there.
EXPOSE 7200

# `start:prod` skips `--env-file=../../.env.local` (only useful in local
# dev). docker-compose `env_file:` supplies the env directly.
CMD ["pnpm", "--filter", "@argus/orchestrator", "start:prod"]
