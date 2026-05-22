# Argus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Argus — a dual-cognition (Claude + Nemotron-on-Crusoe) autonomous SRE agent that survives LLM / Gateway / MCP chaos — by 2026-05-28 10:00 AM PST.

**Architecture:** Next.js 16 web UI + Node orchestrator (AI SDK v6) + Python FastAPI mock service cluster + Node MCP servers. The orchestrator fans every reasoning step to a primary and a shadow provider through TrueFoundry's AI Gateway, executes the primary's tool calls once, and promotes the shadow on primary failure with zero context loss.

**Tech Stack:** TypeScript, Next.js 16 App Router, AI SDK v6, TrueFoundry AI Gateway, Crusoe Cloud Managed Inference (Nemotron), Model Context Protocol (MCP), Python 3.13 FastAPI, Tailwind CSS + shadcn/ui, pnpm workspaces.

**Spec:** `docs/specs/2026-05-21-argus-design.md`

---

## Repo layout (target)

```
devnetwork-hackathon-2026/
├── apps/
│   ├── orchestrator/        # Node + AI SDK v6
│   └── web/                 # Next.js 16
├── services/
│   └── mock-cluster/        # Python FastAPI
├── mcp/                     # Node MCP servers
├── scripts/                 # demo + rehearsal scripts
├── docs/
│   ├── specs/2026-05-21-argus-design.md
│   └── plans/2026-05-21-argus-plan.md   # this file
├── vercel.ts
├── package.json
└── pnpm-workspace.yaml
```

---

## Conventions

- **Commits:** small, frequent. One per task minimum. Format: `<area>: <verb> <thing>` (`orchestrator: add divergence cosine compare`).
- **TypeScript:** strict mode on, `"moduleResolution": "bundler"` everywhere.
- **Tests:** `vitest` for TS, `pytest` for Python. Run from each package root.
- **Env:** `.env.local` at repo root, loaded by all packages via `dotenv` (Python: `pydantic-settings`).
- **Branch:** work directly on `main` for solo hackathon speed. Each task = 1 commit.

---

## Required environment variables

Set in `.env.local` before Phase 2:

```
TRUEFOUNDRY_API_KEY=tfy-...
TRUEFOUNDRY_GATEWAY_URL=https://app.truefoundry.com/api/llm/v1
CRUSOE_API_KEY=crusoe-...
CRUSOE_INFERENCE_URL=https://...crusoecloud.com/v1
ANTHROPIC_API_KEY=sk-ant-...           # direct fallback when Gateway down
NEMOTRON_MODEL=nvidia/nemotron-...     # exact model id from Crusoe console
CLAUDE_MODEL=claude-sonnet-4-6
MOCK_CLUSTER_URL=http://localhost:7100
ORCHESTRATOR_URL=http://localhost:7200
NEXT_PUBLIC_ORCH_URL=http://localhost:7200
```

If `TRUEFOUNDRY_API_KEY` is missing, the orchestrator must boot in "direct-mode-only" so dev still proceeds — the plan calls this out where relevant.

**Resilience features mapped to MVP vs stretch (per spec §9.1 update):**

| Feature | MVP? | Where |
|---------|------|-------|
| Hard-error failover (4xx/5xx/network) | ✓ MVP | Phase 4 Task 4.3 |
| Timeout failover (step budget) | ✓ MVP | Phase 4 Task 4.3 (`withTimeout`) |
| Gateway-down direct-mode fallback | ✓ MVP | Phase 6 Task 6.2 |
| MCP circuit breaker + synthetic envelope | ✓ MVP | Phase 6 Task 6.1 |
| Quarantine cooldown (60 s) | ✓ MVP | Phase 2 Task 2.1 |
| Brownout / predictive promote | stretch | `ProviderRegistry.brownout()` exists but conductor does not call `recordLatency` in MVP |
| Rate-limit (429) explicit backoff with jitter | stretch | MVP treats 429 the same as any other error → immediate failover |
| Log-replay crash recovery (append-only file) | stretch | not implemented in MVP |
| Three-divergence-pause | not applicable | only relevant once remediation mode lands (post-MVP) |

---

# Phase 0 — Scaffold (Day 1, Wed 2026-05-21)

## Task 0.1: Initialize monorepo

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `.gitignore`
- Create: `.editorconfig`
- Create: `tsconfig.base.json`

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "argus",
  "private": true,
  "packageManager": "pnpm@9.0.0",
  "scripts": {
    "dev:web": "pnpm --filter @argus/web dev",
    "dev:orch": "pnpm --filter @argus/orchestrator dev",
    "dev:mcp": "pnpm --filter @argus/mcp dev",
    "dev:cluster": "uv --directory services/mock-cluster run cluster",
    "test": "pnpm -r test",
    "build": "pnpm -r build"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vitest": "^2.1.0",
    "tsx": "^4.19.0",
    "@types/node": "^22.0.0"
  }
}
```

- [ ] **Step 2: Write `pnpm-workspace.yaml`**

```yaml
packages:
  - "apps/*"
  - "mcp"
```

- [ ] **Step 3: Write `.gitignore`**

```
node_modules
.next
dist
.env*
!.env.example
.venv
__pycache__
*.pyc
.DS_Store
.turbo
.vercel
*.log
```

- [ ] **Step 4: Write `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "allowSyntheticDefaultImports": true,
    "forceConsistentCasingInFileNames": true,
    "isolatedModules": true
  }
}
```

- [ ] **Step 5: Write `.editorconfig`**

```
root = true
[*]
indent_style = space
indent_size = 2
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true
[*.py]
indent_size = 4
```

- [ ] **Step 6: Verify pnpm installs**

Run: `pnpm install`
Expected: no errors; `node_modules` created at root.

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-workspace.yaml .gitignore tsconfig.base.json .editorconfig
git commit -m "chore: init monorepo scaffold"
```

---

## Task 0.2: Scaffold orchestrator package

**Files:**
- Create: `apps/orchestrator/package.json`
- Create: `apps/orchestrator/tsconfig.json`
- Create: `apps/orchestrator/vitest.config.ts`
- Create: `apps/orchestrator/src/index.ts`
- Create: `apps/orchestrator/src/types.ts`

- [ ] **Step 1: Write `apps/orchestrator/package.json`**

```json
{
  "name": "@argus/orchestrator",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "tsx src/index.ts",
    "build": "tsc -p .",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "ai": "^6.0.0",
    "@ai-sdk/openai-compatible": "^1.0.0",
    "@modelcontextprotocol/sdk": "^1.0.4",
    "hono": "^4.7.0",
    "@hono/node-server": "^1.13.0",
    "zod": "^3.23.8",
    "dotenv": "^16.4.5"
  },
  "devDependencies": {
    "vitest": "^2.1.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "@types/node": "^22.0.0"
  }
}
```

- [ ] **Step 2: Write `apps/orchestrator/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "types": ["node", "vitest/globals"]
  },
  "include": ["src/**/*", "test/**/*"]
}
```

- [ ] **Step 3: Write `apps/orchestrator/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["test/**/*.test.ts", "src/**/*.test.ts"],
  },
});
```

- [ ] **Step 4: Write `apps/orchestrator/src/types.ts`**

```ts
export type ProviderName = "claude" | "nemotron";

export type ProviderHealth = "healthy" | "quarantined" | "brownout";

export interface ProviderState {
  name: ProviderName;
  health: ProviderHealth;
  lastFailureAt: number | null;
  quarantineUntil: number | null;
  p95LatencyMs: number;
  baselineLatencyMs: number;
}

export interface AgentStep {
  index: number;
  action: AgentAction;
  args: Record<string, unknown>;
  rationale: string;
  hypotheses: string[];
}

export type AgentAction =
  | "search_logs"
  | "query_metrics"
  | "query_traces"
  | "read_runbook"
  | "report";

export interface ToolCallRecord {
  step: number;
  tool: string;
  args: Record<string, unknown>;
  result: unknown;
  durationMs: number;
  status: "ok" | "error" | "synthetic";
}

export interface IncidentState {
  id: string;
  startedAt: number;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  toolLog: ToolCallRecord[];
  scratchpad: string;
  hypotheses: string[];
  steps: AgentStep[];
  primary: ProviderName;
  shadow: ProviderName | null;
  finalReport: string | null;
}

export interface DivergenceScore {
  step: number;
  cosine: number;
  actionMismatch: boolean;
  argsMismatch: boolean;
  flagged: boolean;
  summary: string;
}
```

- [ ] **Step 5: Write `apps/orchestrator/src/index.ts` (stub)**

```ts
import "dotenv/config";

async function main() {
  console.log("argus orchestrator starting");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 6: Verify build + boot**

Run: `pnpm --filter @argus/orchestrator install && pnpm --filter @argus/orchestrator start`
Expected: prints `argus orchestrator starting` and exits.

- [ ] **Step 7: Commit**

```bash
git add apps/orchestrator
git commit -m "orchestrator: scaffold package + types"
```

---

## Task 0.3: Scaffold mock cluster (Python)

**Files:**
- Create: `services/mock-cluster/pyproject.toml`
- Create: `services/mock-cluster/src/argus_cluster/__init__.py`
- Create: `services/mock-cluster/src/argus_cluster/orchestrator.py`
- Create: `services/mock-cluster/.python-version`

- [ ] **Step 1: Write `pyproject.toml`**

```toml
[project]
name = "argus-cluster"
version = "0.0.1"
requires-python = ">=3.13"
dependencies = [
  "fastapi>=0.115.0",
  "uvicorn[standard]>=0.32.0",
  "pydantic>=2.9.0",
  "pydantic-settings>=2.5.0",
  "prometheus-client>=0.21.0",
  "httpx>=0.27.0",
]

[project.optional-dependencies]
dev = ["pytest>=8.3.0", "pytest-asyncio>=0.24.0"]

[project.scripts]
cluster = "argus_cluster.orchestrator:main"

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"
```

- [ ] **Step 2: Write `.python-version`**

```
3.13
```

- [ ] **Step 3: Write `src/argus_cluster/__init__.py`**

```python
__all__ = []
```

- [ ] **Step 4: Write `src/argus_cluster/orchestrator.py`**

```python
"""Boots all 4 mock services on adjacent ports.

  api       :7101
  worker    :7102
  db_proxy  :7103
  auth      :7104
  cluster API surface :7100 (chaos control + health rollup)
"""
from __future__ import annotations
import multiprocessing as mp
import time
import uvicorn


def _run(app_module: str, port: int) -> None:
    uvicorn.run(app_module, host="0.0.0.0", port=port, log_level="info")


def main() -> None:
    services = [
        ("argus_cluster.api:app", 7101),
        ("argus_cluster.worker:app", 7102),
        ("argus_cluster.db_proxy:app", 7103),
        ("argus_cluster.auth:app", 7104),
        ("argus_cluster.gateway:app", 7100),
    ]
    procs = [mp.Process(target=_run, args=(m, p), daemon=False) for m, p in services]
    for p in procs:
        p.start()
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        for p in procs:
            p.terminate()
        for p in procs:
            p.join()


if __name__ == "__main__":
    main()
```

- [ ] **Step 5: Verify uv install works**

Run: `cd services/mock-cluster && uv venv && uv pip install -e .`
Expected: no errors. `services/mock-cluster/.venv` exists.

- [ ] **Step 6: Commit**

```bash
git add services/mock-cluster
git commit -m "cluster: scaffold mock-cluster package"
```

---

## Task 0.4: Scaffold MCP package

**Files:**
- Create: `mcp/package.json`
- Create: `mcp/tsconfig.json`
- Create: `mcp/src/index.ts`

- [ ] **Step 1: Write `mcp/package.json`**

```json
{
  "name": "@argus/mcp",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc -p .",
    "test": "vitest run",
    "logs": "tsx src/logs.ts",
    "metrics": "tsx src/metrics.ts",
    "traces": "tsx src/traces.ts",
    "runbook": "tsx src/runbook.ts"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.4",
    "zod": "^3.23.8",
    "dotenv": "^16.4.5"
  },
  "devDependencies": {
    "vitest": "^2.1.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "@types/node": "^22.0.0"
  }
}
```

- [ ] **Step 2: Write `mcp/tsconfig.json`**

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "types": ["node"]
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Write `mcp/src/index.ts` (stub — real servers in Phase 1)**

```ts
console.log("argus mcp servers stub");
```

- [ ] **Step 4: Commit**

```bash
git add mcp
git commit -m "mcp: scaffold mcp package"
```

---

## Task 0.5: Scaffold Next.js 16 web app

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/next.config.ts`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/tailwind.config.ts`
- Create: `apps/web/postcss.config.mjs`
- Create: `apps/web/app/layout.tsx`
- Create: `apps/web/app/page.tsx`
- Create: `apps/web/app/globals.css`

- [ ] **Step 1: Run scaffold**

Run from repo root:
```bash
pnpm dlx create-next-app@latest apps/web \
  --typescript --tailwind --app --no-src-dir \
  --import-alias "@/*" --yes
```

Then move into the app and ensure version is Next 16:
```bash
cd apps/web && pnpm add next@^16.0.0 react@^19.0.0 react-dom@^19.0.0
```

- [ ] **Step 2: Adjust `apps/web/package.json` name + add deps**

Replace `name` field with `"@argus/web"`. Add deps:

```bash
pnpm --filter @argus/web add ai@^6.0.0 zod@^3.23.8 \
  class-variance-authority clsx tailwind-merge lucide-react
```

- [ ] **Step 3: Install shadcn/ui**

```bash
pnpm --filter @argus/web dlx shadcn@latest init -y -d
pnpm --filter @argus/web dlx shadcn@latest add button card badge separator scroll-area
```

- [ ] **Step 4: Replace `apps/web/app/page.tsx` with landing**

```tsx
import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-100">
      <div className="max-w-2xl space-y-6 p-8">
        <h1 className="text-5xl font-bold tracking-tight">Argus</h1>
        <p className="text-xl text-zinc-400">
          Two cognitions. Zero context loss. Survive the chaos.
        </p>
        <div className="flex gap-3">
          <Link
            href="/incident/demo-worker-oom"
            className="rounded-md bg-zinc-100 px-4 py-2 font-medium text-zinc-900"
          >
            Run demo: worker OOM
          </Link>
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 5: Verify dev server boots**

Run: `pnpm dev:web`
Expected: server on http://localhost:3000; landing page visible.

- [ ] **Step 6: Commit**

```bash
git add apps/web
git commit -m "web: scaffold Next.js 16 app with shadcn/ui"
```

---

# Phase 1 — Mock cluster + chaos hooks (Day 1-2, Wed-Thu)

## Task 1.1: Cluster common modules

**Files:**
- Create: `services/mock-cluster/src/argus_cluster/common/__init__.py`
- Create: `services/mock-cluster/src/argus_cluster/common/state.py`
- Create: `services/mock-cluster/src/argus_cluster/common/chaos.py`
- Create: `services/mock-cluster/src/argus_cluster/common/logs.py`
- Create: `services/mock-cluster/src/argus_cluster/common/metrics.py`
- Create: `services/mock-cluster/src/argus_cluster/common/traces.py`
- Test: `services/mock-cluster/tests/test_chaos.py`

- [ ] **Step 1: Write `common/__init__.py`**

```python
__all__ = []
```

- [ ] **Step 2: Write `common/state.py`**

```python
"""Process-global state for a single mock service."""
from __future__ import annotations
from dataclasses import dataclass, field


@dataclass
class ServiceState:
    name: str
    boot_at: float
    memory_mb: float = 100.0       # simulated heap
    inflight_requests: int = 0
    chaos: dict[str, dict] = field(default_factory=dict)  # type -> params

_state: ServiceState | None = None


def init(name: str, boot_at: float) -> None:
    global _state
    _state = ServiceState(name=name, boot_at=boot_at)


def get() -> ServiceState:
    assert _state is not None, "service state not initialized"
    return _state
```

- [ ] **Step 3: Write `common/chaos.py`**

```python
"""Chaos injection: register/clear and decorator for endpoints."""
from __future__ import annotations
import asyncio
import random
import time
from typing import Awaitable, Callable, TypeVar
from fastapi import HTTPException
from pydantic import BaseModel
from . import state

T = TypeVar("T")


class ChaosSpec(BaseModel):
    type: str        # latency | error_5xx | memleak | crash
    target: str      # service name (informational; the receiving svc applies)
    duration_s: float
    params: dict = {}


def inject(spec: ChaosSpec) -> None:
    s = state.get()
    s.chaos[spec.type] = {
        "expires_at": time.time() + spec.duration_s,
        **spec.params,
    }


def clear() -> None:
    state.get().chaos.clear()


def _active(kind: str) -> dict | None:
    s = state.get()
    entry = s.chaos.get(kind)
    if entry is None:
        return None
    if time.time() >= entry["expires_at"]:
        s.chaos.pop(kind, None)
        return None
    return entry


async def apply(endpoint: str) -> None:
    """Call at the top of each request handler to apply active chaos."""
    if (lat := _active("latency")) is not None:
        mean = lat.get("mean_ms", 500) / 1000
        await asyncio.sleep(random.uniform(mean * 0.5, mean * 1.5))
    if (err := _active("error_5xx")) is not None:
        rate = err.get("rate", 0.5)
        if random.random() < rate:
            raise HTTPException(status_code=503, detail="chaos: 5xx injected")
    if (crash := _active("crash")) is not None:
        # one-shot crash
        state.get().chaos.pop("crash", None)
        import os
        os._exit(1)


def memleak_tick() -> None:
    """Called by background tick — applies memory growth if memleak active."""
    if (leak := _active("memleak")) is not None:
        rate = leak.get("mb_per_tick", 5)
        state.get().memory_mb += rate
```

- [ ] **Step 4: Write `common/logs.py`**

```python
"""Structured logs: ring buffer per service, queryable via cluster API."""
from __future__ import annotations
import collections
import json
import time
from typing import Any

_RING: collections.deque[dict[str, Any]] = collections.deque(maxlen=5000)


def emit(level: str, msg: str, **fields: Any) -> None:
    rec = {"ts": time.time(), "level": level, "msg": msg, **fields}
    _RING.append(rec)
    print(json.dumps(rec), flush=True)


def snapshot() -> list[dict[str, Any]]:
    return list(_RING)
```

- [ ] **Step 5: Write `common/metrics.py`**

```python
"""Prometheus-style counters/gauges per service."""
from __future__ import annotations
from prometheus_client import Counter, Gauge, generate_latest, CONTENT_TYPE_LATEST

requests_total = Counter("requests_total", "request count", ["service", "code"])
inflight = Gauge("inflight_requests", "in-flight", ["service"])
memory_mb = Gauge("memory_mb", "simulated heap MB", ["service"])


def render() -> tuple[bytes, str]:
    return generate_latest(), CONTENT_TYPE_LATEST
```

- [ ] **Step 6: Write `common/traces.py`**

```python
"""Mock OTel-ish span list, in-memory."""
from __future__ import annotations
import collections
import time
import uuid
from contextlib import contextmanager
from typing import Any

_SPANS: collections.deque[dict[str, Any]] = collections.deque(maxlen=2000)


@contextmanager
def span(name: str, **attrs: Any):
    span_id = uuid.uuid4().hex[:8]
    start = time.time()
    try:
        yield span_id
    finally:
        _SPANS.append({
            "id": span_id, "name": name, "start": start,
            "duration_ms": (time.time() - start) * 1000, **attrs,
        })


def snapshot() -> list[dict[str, Any]]:
    return list(_SPANS)
```

- [ ] **Step 7: Write `tests/test_chaos.py`**

```python
import asyncio
import time
from argus_cluster.common import chaos, state


def setup_function():
    state.init("test", time.time())


def test_inject_and_clear_latency():
    chaos.inject(chaos.ChaosSpec(type="latency", target="test", duration_s=10, params={"mean_ms": 1}))
    assert chaos._active("latency") is not None
    chaos.clear()
    assert chaos._active("latency") is None


def test_latency_applies_under_one_second():
    chaos.inject(chaos.ChaosSpec(type="latency", target="test", duration_s=10, params={"mean_ms": 100}))
    start = time.time()
    asyncio.run(chaos.apply("/x"))
    elapsed = time.time() - start
    assert 0.04 < elapsed < 0.30
    chaos.clear()


def test_expired_chaos_self_clears():
    chaos.inject(chaos.ChaosSpec(type="latency", target="test", duration_s=0.05, params={"mean_ms": 1000}))
    time.sleep(0.06)
    assert chaos._active("latency") is None
```

- [ ] **Step 8: Run tests**

Run: `cd services/mock-cluster && uv run pytest -v`
Expected: all 3 tests pass.

- [ ] **Step 9: Commit**

```bash
git add services/mock-cluster
git commit -m "cluster: common modules (state/chaos/logs/metrics/traces)"
```

---

## Task 1.2: Mock services (api / worker / db_proxy / auth)

**Files:**
- Create: `services/mock-cluster/src/argus_cluster/api.py`
- Create: `services/mock-cluster/src/argus_cluster/worker.py`
- Create: `services/mock-cluster/src/argus_cluster/db_proxy.py`
- Create: `services/mock-cluster/src/argus_cluster/auth.py`
- Create: `services/mock-cluster/src/argus_cluster/gateway.py`

- [ ] **Step 1: Write `gateway.py` (cluster control plane on :7100)**

```python
"""Cluster-wide chaos control + query rollup (logs/metrics/traces from all services)."""
from __future__ import annotations
import httpx
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="argus-cluster-gateway")

SERVICES = {
    "api":      "http://127.0.0.1:7101",
    "worker":   "http://127.0.0.1:7102",
    "db_proxy": "http://127.0.0.1:7103",
    "auth":     "http://127.0.0.1:7104",
}


class ChaosBody(BaseModel):
    type: str
    target: str
    duration_s: float
    params: dict = {}


@app.post("/chaos/inject")
async def chaos_inject(body: ChaosBody):
    url = SERVICES.get(body.target)
    if url is None:
        return {"error": f"unknown target {body.target}"}
    async with httpx.AsyncClient(timeout=5) as c:
        r = await c.post(f"{url}/chaos/inject", json=body.model_dump())
    return r.json()


@app.post("/chaos/clear")
async def chaos_clear():
    async with httpx.AsyncClient(timeout=5) as c:
        for u in SERVICES.values():
            try:
                await c.post(f"{u}/chaos/clear")
            except Exception:
                pass
    return {"ok": True}


@app.get("/logs")
async def logs(service: str | None = None, q: str | None = None, since: float | None = None):
    """Aggregate logs across services. Filter by service, substring, ts."""
    out: list[dict] = []
    async with httpx.AsyncClient(timeout=5) as c:
        targets = [service] if service in SERVICES else SERVICES.keys()
        for name in targets:
            try:
                r = await c.get(f"{SERVICES[name]}/_internal/logs")
                for rec in r.json():
                    if since is not None and rec["ts"] < since:
                        continue
                    if q and q.lower() not in rec["msg"].lower():
                        continue
                    rec["service"] = name
                    out.append(rec)
            except Exception:
                continue
    return out


@app.get("/metrics")
async def metrics(service: str | None = None):
    out: dict[str, str] = {}
    async with httpx.AsyncClient(timeout=5) as c:
        targets = [service] if service in SERVICES else SERVICES.keys()
        for name in targets:
            try:
                r = await c.get(f"{SERVICES[name]}/metrics")
                out[name] = r.text
            except Exception:
                out[name] = ""
    return out


@app.get("/traces")
async def traces(service: str | None = None):
    out: list[dict] = []
    async with httpx.AsyncClient(timeout=5) as c:
        targets = [service] if service in SERVICES else SERVICES.keys()
        for name in targets:
            try:
                r = await c.get(f"{SERVICES[name]}/_internal/traces")
                for s in r.json():
                    s["service"] = name
                    out.append(s)
            except Exception:
                continue
    return out


@app.get("/health")
async def health():
    out = {}
    async with httpx.AsyncClient(timeout=2) as c:
        for name, u in SERVICES.items():
            try:
                r = await c.get(f"{u}/health")
                out[name] = r.json()
            except Exception as e:
                out[name] = {"status": "down", "error": str(e)}
    return out
```

- [ ] **Step 2: Write `api.py`**

```python
"""api service: thin HTTP fronts that calls worker + db_proxy + auth."""
from __future__ import annotations
import asyncio
import time
import httpx
from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from argus_cluster.common import chaos, logs, metrics, state, traces

state.init("api", time.time())
app = FastAPI(title="argus-api")

WORKER_URL = "http://127.0.0.1:7102"
DB_URL = "http://127.0.0.1:7103"
AUTH_URL = "http://127.0.0.1:7104"


@app.middleware("http")
async def chaos_mw(request, call_next):
    await chaos.apply(request.url.path)
    return await call_next(request)


@app.post("/chaos/inject")
async def chaos_inject(spec: chaos.ChaosSpec):
    chaos.inject(spec)
    logs.emit("info", "chaos injected", chaos=spec.model_dump())
    return {"ok": True}


@app.post("/chaos/clear")
async def chaos_clear():
    chaos.clear()
    return {"ok": True}


@app.get("/health")
async def health():
    s = state.get()
    return {"status": "ok", "memory_mb": s.memory_mb, "inflight": s.inflight_requests}


@app.get("/metrics")
async def metrics_endpoint():
    body, ct = metrics.render()
    return Response(content=body, media_type=ct)


@app.get("/_internal/logs")
async def _logs():
    return logs.snapshot()


@app.get("/_internal/traces")
async def _traces():
    return traces.snapshot()


@app.get("/process/{job_id}")
async def process_job(job_id: str):
    metrics.inflight.labels("api").inc()
    s = state.get()
    s.inflight_requests += 1
    try:
        with traces.span("api.process", job=job_id):
            async with httpx.AsyncClient(timeout=2) as c:
                try:
                    await c.post(f"{AUTH_URL}/verify", json={"job": job_id})
                except Exception as e:
                    logs.emit("error", "auth failed", err=str(e))
                    metrics.requests_total.labels("api", "401").inc()
                    raise HTTPException(401, "auth down")
                try:
                    r = await c.post(f"{WORKER_URL}/run", json={"job": job_id})
                    out = r.json()
                except httpx.HTTPError as e:
                    logs.emit("error", "worker failed", err=str(e), job=job_id)
                    metrics.requests_total.labels("api", "503").inc()
                    raise HTTPException(503, f"worker error: {e}")
                metrics.requests_total.labels("api", "200").inc()
                return {"job": job_id, "result": out}
    finally:
        s.inflight_requests -= 1
        metrics.inflight.labels("api").dec()
```

- [ ] **Step 3: Write `worker.py`** (memory leak target)

```python
"""worker service: simulates compute; vulnerable to memleak chaos."""
from __future__ import annotations
import asyncio
import time
from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from argus_cluster.common import chaos, logs, metrics, state, traces

state.init("worker", time.time())
app = FastAPI(title="argus-worker")


@app.on_event("startup")
async def _bg_tick():
    async def tick():
        while True:
            chaos.memleak_tick()
            s = state.get()
            metrics.memory_mb.labels("worker").set(s.memory_mb)
            # crude OOM: above 1024 MB → emit + 503 all requests until restart
            if s.memory_mb > 1024 and "oom" not in s.chaos:
                logs.emit("error", "OutOfMemoryError: heap exhausted", memory_mb=s.memory_mb)
                s.chaos["oom"] = {"expires_at": time.time() + 9999}
            await asyncio.sleep(1.0)
    asyncio.create_task(tick())


@app.middleware("http")
async def chaos_mw(request, call_next):
    await chaos.apply(request.url.path)
    if "oom" in state.get().chaos and not request.url.path.startswith(("/chaos", "/health", "/metrics", "/_internal")):
        return Response(status_code=503, content="OOM")
    return await call_next(request)


@app.post("/chaos/inject")
async def chaos_inject(spec: chaos.ChaosSpec):
    chaos.inject(spec)
    logs.emit("info", "chaos injected", chaos=spec.model_dump())
    return {"ok": True}


@app.post("/chaos/clear")
async def chaos_clear():
    chaos.clear()
    state.get().memory_mb = 100.0
    return {"ok": True}


@app.get("/health")
async def health():
    s = state.get()
    healthy = "oom" not in s.chaos and s.memory_mb < 900
    return {"status": "ok" if healthy else "degraded", "memory_mb": s.memory_mb}


@app.get("/metrics")
async def metrics_endpoint():
    body, ct = metrics.render()
    return Response(content=body, media_type=ct)


@app.get("/_internal/logs")
async def _logs():
    return logs.snapshot()


@app.get("/_internal/traces")
async def _traces():
    return traces.snapshot()


@app.post("/run")
async def run(body: dict):
    with traces.span("worker.run", job=body.get("job")):
        await asyncio.sleep(0.05)
        metrics.requests_total.labels("worker", "200").inc()
        logs.emit("info", "job done", job=body.get("job"))
        return {"result": "ok"}
```

- [ ] **Step 4: Write `db_proxy.py`** (connection pool exhaustion target)

```python
"""db_proxy: pool can saturate under slow_query chaos."""
from __future__ import annotations
import asyncio
import time
from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from argus_cluster.common import chaos, logs, metrics, state, traces

state.init("db_proxy", time.time())
app = FastAPI(title="argus-db-proxy")
POOL_SIZE = 10
_sem = asyncio.Semaphore(POOL_SIZE)


@app.middleware("http")
async def chaos_mw(request, call_next):
    await chaos.apply(request.url.path)
    return await call_next(request)


@app.post("/chaos/inject")
async def chaos_inject(spec: chaos.ChaosSpec):
    chaos.inject(spec)
    return {"ok": True}


@app.post("/chaos/clear")
async def chaos_clear():
    chaos.clear()
    return {"ok": True}


@app.get("/health")
async def health():
    return {"status": "ok", "pool_used": POOL_SIZE - _sem._value, "pool_size": POOL_SIZE}


@app.get("/metrics")
async def metrics_endpoint():
    body, ct = metrics.render()
    return Response(content=body, media_type=ct)


@app.get("/_internal/logs")
async def _logs(): return logs.snapshot()


@app.get("/_internal/traces")
async def _traces(): return traces.snapshot()


@app.post("/query")
async def query(body: dict):
    try:
        await asyncio.wait_for(_sem.acquire(), timeout=2.0)
    except asyncio.TimeoutError:
        logs.emit("error", "db pool exhausted", inflight=POOL_SIZE)
        metrics.requests_total.labels("db_proxy", "503").inc()
        raise HTTPException(503, "pool exhausted")
    try:
        with traces.span("db.query"):
            slow = chaos._active("slow_query")
            delay = (slow or {}).get("ms", 30) / 1000
            await asyncio.sleep(delay)
            metrics.requests_total.labels("db_proxy", "200").inc()
            return {"rows": 1}
    finally:
        _sem.release()
```

- [ ] **Step 5: Write `auth.py`**

```python
"""auth: light verify endpoint; calls db_proxy."""
from __future__ import annotations
import time
import httpx
from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from argus_cluster.common import chaos, logs, metrics, state, traces

state.init("auth", time.time())
app = FastAPI(title="argus-auth")
DB_URL = "http://127.0.0.1:7103"


@app.middleware("http")
async def chaos_mw(request, call_next):
    await chaos.apply(request.url.path)
    return await call_next(request)


@app.post("/chaos/inject")
async def chaos_inject(spec: chaos.ChaosSpec):
    chaos.inject(spec)
    return {"ok": True}


@app.post("/chaos/clear")
async def chaos_clear():
    chaos.clear()
    return {"ok": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/metrics")
async def metrics_endpoint():
    body, ct = metrics.render()
    return Response(content=body, media_type=ct)


@app.get("/_internal/logs")
async def _logs(): return logs.snapshot()


@app.get("/_internal/traces")
async def _traces(): return traces.snapshot()


@app.post("/verify")
async def verify(body: dict):
    with traces.span("auth.verify"):
        async with httpx.AsyncClient(timeout=2) as c:
            r = await c.post(f"{DB_URL}/query", json={"sql": "select 1"})
        if r.status_code != 200:
            logs.emit("error", "auth.verify db error", code=r.status_code)
            raise HTTPException(503, "db down")
        return {"ok": True}
```

- [ ] **Step 6: Boot the cluster and smoke-test**

Run: `pnpm dev:cluster` (or `uv --directory services/mock-cluster run cluster`)
Expected: 5 uvicorn processes on ports 7100-7104.

```bash
curl http://127.0.0.1:7100/health
```
Expected: JSON with all services `status: ok`.

```bash
curl -X POST http://127.0.0.1:7100/chaos/inject \
  -H 'content-type: application/json' \
  -d '{"type":"memleak","target":"worker","duration_s":60,"params":{"mb_per_tick":100}}'
sleep 12
curl http://127.0.0.1:7100/logs?service=worker | python -m json.tool | head -20
```
Expected: an `OutOfMemoryError` log line appears.

- [ ] **Step 7: Commit**

```bash
git add services/mock-cluster
git commit -m "cluster: 4 mock services + control gateway"
```

---

## Task 1.3: MCP servers (logs / metrics / traces / runbook)

**Files:**
- Create: `mcp/src/cluster.ts`
- Create: `mcp/src/logs.ts`
- Create: `mcp/src/metrics.ts`
- Create: `mcp/src/traces.ts`
- Create: `mcp/src/runbook.ts`
- Create: `mcp/runbooks/api.md`
- Create: `mcp/runbooks/worker.md`
- Create: `mcp/runbooks/db_proxy.md`
- Create: `mcp/runbooks/auth.md`

- [ ] **Step 1: Write `mcp/src/cluster.ts`** (shared HTTP client)

```ts
const BASE = process.env.MOCK_CLUSTER_URL ?? "http://127.0.0.1:7100";

export async function getLogs(opts: { service?: string; q?: string; since?: number }) {
  const params = new URLSearchParams();
  if (opts.service) params.set("service", opts.service);
  if (opts.q) params.set("q", opts.q);
  if (opts.since !== undefined) params.set("since", String(opts.since));
  const res = await fetch(`${BASE}/logs?${params.toString()}`);
  if (!res.ok) throw new Error(`logs ${res.status}`);
  return (await res.json()) as Array<Record<string, unknown>>;
}

export async function getMetrics(service?: string) {
  const params = new URLSearchParams();
  if (service) params.set("service", service);
  const res = await fetch(`${BASE}/metrics?${params.toString()}`);
  if (!res.ok) throw new Error(`metrics ${res.status}`);
  return (await res.json()) as Record<string, string>;
}

export async function getTraces(service?: string) {
  const params = new URLSearchParams();
  if (service) params.set("service", service);
  const res = await fetch(`${BASE}/traces?${params.toString()}`);
  if (!res.ok) throw new Error(`traces ${res.status}`);
  return (await res.json()) as Array<Record<string, unknown>>;
}
```

- [ ] **Step 2: Write `mcp/src/logs.ts`**

```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getLogs } from "./cluster.js";

const server = new McpServer({ name: "argus-logs", version: "0.1.0" });

server.tool(
  "search_logs",
  "Search structured logs. Filter by service name and substring query.",
  {
    service: z.enum(["api", "worker", "db_proxy", "auth"]).optional(),
    q: z.string().optional().describe("substring match on log msg"),
    since_unix: z.number().optional().describe("only logs since this unix ts"),
    limit: z.number().int().min(1).max(200).default(50),
  },
  async ({ service, q, since_unix, limit }) => {
    const logs = await getLogs({ service, q, since: since_unix });
    const trimmed = logs.slice(-limit);
    return {
      content: [{ type: "text", text: JSON.stringify({ count: trimmed.length, logs: trimmed }, null, 2) }],
    };
  },
);

await server.connect(new StdioServerTransport());
```

- [ ] **Step 3: Write `mcp/src/metrics.ts`**

```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getMetrics } from "./cluster.js";

const server = new McpServer({ name: "argus-metrics", version: "0.1.0" });

server.tool(
  "query_metrics",
  "Get current Prometheus metrics by service (returns the raw exposition format text).",
  {
    service: z.enum(["api", "worker", "db_proxy", "auth"]).optional(),
  },
  async ({ service }) => {
    const m = await getMetrics(service);
    return { content: [{ type: "text", text: JSON.stringify(m, null, 2) }] };
  },
);

await server.connect(new StdioServerTransport());
```

- [ ] **Step 4: Write `mcp/src/traces.ts`**

```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getTraces } from "./cluster.js";

const server = new McpServer({ name: "argus-traces", version: "0.1.0" });

server.tool(
  "query_traces",
  "Get recent spans, optionally filtered by service.",
  { service: z.enum(["api", "worker", "db_proxy", "auth"]).optional() },
  async ({ service }) => {
    const traces = await getTraces(service);
    return { content: [{ type: "text", text: JSON.stringify(traces.slice(-100), null, 2) }] };
  },
);

await server.connect(new StdioServerTransport());
```

- [ ] **Step 5: Write `mcp/src/runbook.ts`**

```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const runbookDir = resolve(here, "../runbooks");

const server = new McpServer({ name: "argus-runbook", version: "0.1.0" });

server.tool(
  "read_runbook",
  "Read the runbook for a specific service.",
  { service: z.enum(["api", "worker", "db_proxy", "auth"]) },
  async ({ service }) => {
    const path = resolve(runbookDir, `${service}.md`);
    const content = await readFile(path, "utf8");
    return { content: [{ type: "text", text: content }] };
  },
);

await server.connect(new StdioServerTransport());
```

- [ ] **Step 6: Write `mcp/runbooks/worker.md`**

```markdown
# Worker Service Runbook

## Symptoms → likely cause
- `OutOfMemoryError` in logs → memory leak in batch processor (since release 0.4.2).
- High memory_mb metric over 800 with rising trend → leak confirmed.
- Cascading 503s in `api` → worker upstream is OOM-killed.

## Triage steps
1. Search worker logs for `OutOfMemoryError`.
2. Check worker `memory_mb` metric trend over last 5 min.
3. Confirm cascading 503 spike in `api` `requests_total{code="503"}`.

## Remediation
- Short-term: restart worker process to clear leak.
- Long-term: roll back `batch_processor` to <0.4.2.
```

- [ ] **Step 7: Write the other three runbooks**

```bash
# api.md
cat > mcp/runbooks/api.md <<'EOF'
# API Service Runbook

## Symptoms → likely cause
- 503 spikes in `requests_total{code="503"}` → upstream worker or db_proxy unhealthy.
- 401 spikes → auth service failing.

## Triage
1. Inspect `api` logs for downstream error pattern.
2. Check upstream health: worker, db_proxy, auth.
3. Confirm via traces which span is failing.
EOF

# db_proxy.md
cat > mcp/runbooks/db_proxy.md <<'EOF'
# DB Proxy Runbook

## Symptoms → likely cause
- `pool exhausted` log lines → connection pool saturated by slow queries.
- `pool_used` at `pool_size` for >30s → confirmed saturation.

## Triage
1. Search logs for `pool exhausted`.
2. Check inflight in `/health`.
3. Inspect traces for `db.query` spans with anomalous duration_ms.

## Remediation
- Identify slow query upstream; cancel.
- Increase pool size if structural.
EOF

# auth.md
cat > mcp/runbooks/auth.md <<'EOF'
# Auth Runbook

## Symptoms → likely cause
- `auth.verify db error` logs → upstream db_proxy unhealthy.
- 503s from `/verify` → propagating from db_proxy.

## Triage
1. Check auth logs for `db error`.
2. Confirm db_proxy health.
EOF
```

- [ ] **Step 8: Boot MCP servers (each on its own stdio process)**

The orchestrator will spawn these in Phase 3. For now smoke-test logs MCP manually:

```bash
pnpm --filter @argus/mcp install
# In one shell, run cluster: pnpm dev:cluster
# Then:
pnpm --filter @argus/mcp logs
```
Expected: server initializes; press Ctrl-C to exit. No tools invoked yet — confirmation that stdio handshake works.

- [ ] **Step 9: Commit**

```bash
git add mcp
git commit -m "mcp: logs/metrics/traces/runbook stdio servers + runbooks"
```

---

# Phase 2 — Gateway client + providers (Day 2, Thu 2026-05-22)

## Task 2.1: Provider registry + health tracking

**Files:**
- Create: `apps/orchestrator/src/providers.ts`
- Test: `apps/orchestrator/test/providers.test.ts`

- [ ] **Step 1: Write failing test `test/providers.test.ts`**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import {
  ProviderRegistry,
} from "../src/providers.js";

describe("ProviderRegistry", () => {
  let reg: ProviderRegistry;
  beforeEach(() => {
    reg = new ProviderRegistry(["claude", "nemotron"], { quarantineMs: 60_000 });
  });

  it("starts all providers healthy", () => {
    expect(reg.healthy()).toEqual(["claude", "nemotron"]);
  });

  it("quarantines a provider on failure", () => {
    reg.markFailure("claude", Date.now());
    expect(reg.healthy()).toEqual(["nemotron"]);
    expect(reg.isHealthy("claude")).toBe(false);
  });

  it("recovers from quarantine after window", () => {
    const now = Date.now();
    reg.markFailure("claude", now);
    expect(reg.isHealthy("claude")).toBe(false);
    reg.tick(now + 60_001);
    expect(reg.isHealthy("claude")).toBe(true);
  });

  it("flags brownout when p95 > 3x baseline", () => {
    reg.recordLatency("claude", 100);
    reg.recordLatency("claude", 100);
    reg.recordLatency("claude", 100);
    expect(reg.brownout("claude")).toBe(false);
    reg.recordLatency("claude", 500);
    expect(reg.brownout("claude")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

Run: `pnpm --filter @argus/orchestrator test -- providers`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/providers.ts`**

```ts
import type { ProviderName, ProviderState } from "./types.js";

export interface ProviderRegistryOpts {
  quarantineMs: number;
}

export class ProviderRegistry {
  private state: Map<ProviderName, ProviderState>;
  private latencies: Map<ProviderName, number[]> = new Map();
  private quarantineMs: number;

  constructor(providers: ProviderName[], opts: ProviderRegistryOpts) {
    this.quarantineMs = opts.quarantineMs;
    this.state = new Map(
      providers.map((p) => [
        p,
        {
          name: p,
          health: "healthy" as const,
          lastFailureAt: null,
          quarantineUntil: null,
          p95LatencyMs: 0,
          baselineLatencyMs: 0,
        },
      ]),
    );
  }

  list(): ProviderName[] {
    return [...this.state.keys()];
  }

  isHealthy(name: ProviderName): boolean {
    const s = this.state.get(name);
    if (!s) return false;
    if (s.quarantineUntil !== null && Date.now() < s.quarantineUntil) return false;
    return true;
  }

  healthy(): ProviderName[] {
    return this.list().filter((p) => this.isHealthy(p));
  }

  markFailure(name: ProviderName, at: number): void {
    const s = this.state.get(name);
    if (!s) return;
    s.health = "quarantined";
    s.lastFailureAt = at;
    s.quarantineUntil = at + this.quarantineMs;
  }

  markSuccess(name: ProviderName): void {
    const s = this.state.get(name);
    if (!s) return;
    s.health = "healthy";
    s.quarantineUntil = null;
  }

  recordLatency(name: ProviderName, ms: number): void {
    const buf = this.latencies.get(name) ?? [];
    buf.push(ms);
    while (buf.length > 50) buf.shift();
    this.latencies.set(name, buf);
    const s = this.state.get(name);
    if (s) {
      if (s.baselineLatencyMs === 0) s.baselineLatencyMs = ms;
      s.p95LatencyMs = this.percentile(buf, 0.95);
    }
  }

  brownout(name: ProviderName): boolean {
    const s = this.state.get(name);
    if (!s || s.baselineLatencyMs === 0) return false;
    return s.p95LatencyMs > 3 * s.baselineLatencyMs;
  }

  tick(now: number): void {
    for (const s of this.state.values()) {
      if (s.quarantineUntil !== null && now >= s.quarantineUntil) {
        s.quarantineUntil = null;
        s.health = "healthy";
      }
    }
  }

  private percentile(values: number[], p: number): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
    return sorted[idx]!;
  }
}
```

- [ ] **Step 4: Run tests, expect PASS**

Run: `pnpm --filter @argus/orchestrator test -- providers`
Expected: all 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/orchestrator/src/providers.ts apps/orchestrator/test/providers.test.ts
git commit -m "orchestrator: provider registry with quarantine + brownout"
```

---

## Task 2.2: Gateway client (TrueFoundry + direct fallback)

**Files:**
- Create: `apps/orchestrator/src/gateway.ts`
- Test: `apps/orchestrator/test/gateway.test.ts`

- [ ] **Step 1: Write failing test `test/gateway.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GatewayClient, GatewayError } from "../src/gateway.js";

describe("GatewayClient", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("calls TrueFoundry Gateway by default", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: "hi" } }] }), { status: 200 }),
    );
    const gw = new GatewayClient({
      gatewayUrl: "https://gw/v1",
      gatewayKey: "k",
      directKeys: { claude: "ak", nemotron: "ck" },
      directUrls: { claude: "https://anth/v1", nemotron: "https://crusoe/v1" },
      fetch: fetchMock,
    });
    const res = await gw.chat({ provider: "claude", model: "claude-x", messages: [], temperature: 0 });
    expect(res.text).toBe("hi");
    expect(fetchMock.mock.calls[0]![0]).toBe("https://gw/v1/chat/completions");
  });

  it("throws GatewayError on 503", async () => {
    const fetchMock = vi.fn(async () => new Response("nope", { status: 503 }));
    const gw = new GatewayClient({
      gatewayUrl: "https://gw/v1",
      gatewayKey: "k",
      directKeys: { claude: "ak", nemotron: "ck" },
      directUrls: { claude: "https://anth/v1", nemotron: "https://crusoe/v1" },
      fetch: fetchMock,
    });
    await expect(gw.chat({ provider: "claude", model: "claude-x", messages: [], temperature: 0 }))
      .rejects.toBeInstanceOf(GatewayError);
  });

  it("falls back to direct provider when gateway disabled", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: "hi-direct" } }] }), { status: 200 }),
    );
    const gw = new GatewayClient({
      gatewayUrl: "https://gw/v1",
      gatewayKey: "k",
      directKeys: { claude: "ak", nemotron: "ck" },
      directUrls: { claude: "https://anth/v1", nemotron: "https://crusoe/v1" },
      fetch: fetchMock,
    });
    gw.setMode("direct");
    const res = await gw.chat({ provider: "claude", model: "claude-x", messages: [], temperature: 0 });
    expect(res.text).toBe("hi-direct");
    expect(fetchMock.mock.calls[0]![0]).toBe("https://anth/v1/chat/completions");
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

Run: `pnpm --filter @argus/orchestrator test -- gateway`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/gateway.ts`**

```ts
import type { ProviderName } from "./types.js";

export class GatewayError extends Error {
  constructor(message: string, public status: number, public provider: ProviderName) {
    super(message);
  }
}

export type GatewayMode = "gateway" | "direct";

export interface ChatRequest {
  provider: ProviderName;
  model: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  temperature: number;
  maxTokens?: number;
  responseFormat?: "json_object" | "text";
}

export interface ChatResponse {
  text: string;
  latencyMs: number;
  provider: ProviderName;
  via: GatewayMode;
}

export interface GatewayClientOpts {
  gatewayUrl: string;
  gatewayKey: string;
  directKeys: Record<ProviderName, string>;
  directUrls: Record<ProviderName, string>;
  fetch?: typeof fetch;
}

export class GatewayClient {
  private mode: GatewayMode = "gateway";
  private fetch: typeof fetch;

  constructor(private opts: GatewayClientOpts) {
    this.fetch = opts.fetch ?? globalThis.fetch;
  }

  setMode(mode: GatewayMode): void {
    this.mode = mode;
  }

  getMode(): GatewayMode {
    return this.mode;
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    const { url, headers } = this.endpoint(req.provider);
    const body = {
      model: req.model,
      messages: req.messages,
      temperature: req.temperature,
      ...(req.maxTokens ? { max_tokens: req.maxTokens } : {}),
      ...(req.responseFormat === "json_object"
        ? { response_format: { type: "json_object" } }
        : {}),
    };
    const t0 = Date.now();
    let res: Response;
    try {
      res = await this.fetch(`${url}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify(body),
      });
    } catch (err) {
      throw new GatewayError(`network: ${(err as Error).message}`, 0, req.provider);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new GatewayError(`status ${res.status}: ${text.slice(0, 200)}`, res.status, req.provider);
    }
    const json = (await res.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    const text = json.choices[0]?.message?.content ?? "";
    return { text, latencyMs: Date.now() - t0, provider: req.provider, via: this.mode };
  }

  private endpoint(provider: ProviderName): { url: string; headers: Record<string, string> } {
    if (this.mode === "gateway") {
      return {
        url: this.opts.gatewayUrl,
        headers: { authorization: `Bearer ${this.opts.gatewayKey}` },
      };
    }
    return {
      url: this.opts.directUrls[provider],
      headers: { authorization: `Bearer ${this.opts.directKeys[provider]}` },
    };
  }
}
```

- [ ] **Step 4: Run tests, expect PASS**

Run: `pnpm --filter @argus/orchestrator test -- gateway`
Expected: all 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/orchestrator/src/gateway.ts apps/orchestrator/test/gateway.test.ts
git commit -m "orchestrator: gateway client + direct-mode fallback"
```

---

## Task 2.3: Smoke-test real providers (manual)

**Files:**
- Create: `apps/orchestrator/scripts/smoke.ts`

- [ ] **Step 1: Write `scripts/smoke.ts`**

```ts
import "dotenv/config";
import { GatewayClient } from "../src/gateway.js";

const gw = new GatewayClient({
  gatewayUrl: process.env.TRUEFOUNDRY_GATEWAY_URL!,
  gatewayKey: process.env.TRUEFOUNDRY_API_KEY!,
  directKeys: {
    claude: process.env.ANTHROPIC_API_KEY!,
    nemotron: process.env.CRUSOE_API_KEY!,
  },
  directUrls: {
    claude: "https://api.anthropic.com/v1",
    nemotron: process.env.CRUSOE_INFERENCE_URL!,
  },
});

async function test(provider: "claude" | "nemotron", model: string) {
  console.log(`--- ${provider} (${model}) ---`);
  const res = await gw.chat({
    provider,
    model,
    messages: [{ role: "user", content: "Reply with the single word PONG." }],
    temperature: 0,
  });
  console.log(`  via=${res.via} latency=${res.latencyMs}ms`);
  console.log(`  ${res.text.trim()}`);
}

await test("claude", process.env.CLAUDE_MODEL!);
await test("nemotron", process.env.NEMOTRON_MODEL!);
```

- [ ] **Step 2: Run smoke**

Run: `pnpm --filter @argus/orchestrator exec tsx scripts/smoke.ts`
Expected: both providers return `PONG` (or similar). If either fails, follow the error message to fix env vars or model name before proceeding.

- [ ] **Step 3: Commit script**

```bash
git add apps/orchestrator/scripts/smoke.ts
git commit -m "orchestrator: smoke script for real provider access"
```

---

# Phase 3 — Conductor (single-provider loop) (Day 3, Fri 2026-05-23)

## Task 3.1: Incident state

**Files:**
- Create: `apps/orchestrator/src/state.ts`
- Test: `apps/orchestrator/test/state.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from "vitest";
import { createIncident, appendToolResult, appendStep, finalize } from "../src/state.js";

describe("IncidentState", () => {
  it("creates with sane defaults", () => {
    const s = createIncident("inc_1", "system prompt");
    expect(s.id).toBe("inc_1");
    expect(s.messages.length).toBe(1);
    expect(s.messages[0]!.role).toBe("system");
    expect(s.toolLog.length).toBe(0);
    expect(s.steps.length).toBe(0);
    expect(s.primary).toBe("claude");
    expect(s.shadow).toBe("nemotron");
  });

  it("appendStep adds to history", () => {
    const s = createIncident("inc_1", "sys");
    appendStep(s, { index: 0, action: "search_logs", args: { q: "OOM" }, rationale: "look for OOM", hypotheses: [] });
    expect(s.steps.length).toBe(1);
  });

  it("appendToolResult adds to log", () => {
    const s = createIncident("inc_1", "sys");
    appendToolResult(s, { step: 0, tool: "search_logs", args: { q: "OOM" }, result: { count: 3 }, durationMs: 12, status: "ok" });
    expect(s.toolLog.length).toBe(1);
  });

  it("finalize sets final report", () => {
    const s = createIncident("inc_1", "sys");
    finalize(s, "# Report");
    expect(s.finalReport).toBe("# Report");
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `pnpm --filter @argus/orchestrator test -- state`
Expected: FAIL.

- [ ] **Step 3: Write `src/state.ts`**

```ts
import type { AgentStep, IncidentState, ToolCallRecord } from "./types.js";

export function createIncident(id: string, systemPrompt: string): IncidentState {
  return {
    id,
    startedAt: Date.now(),
    messages: [{ role: "system", content: systemPrompt }],
    toolLog: [],
    scratchpad: "",
    hypotheses: [],
    steps: [],
    primary: "claude",
    shadow: "nemotron",
    finalReport: null,
  };
}

export function appendStep(s: IncidentState, step: AgentStep): void {
  s.steps.push(step);
}

export function appendToolResult(s: IncidentState, rec: ToolCallRecord): void {
  s.toolLog.push(rec);
}

export function finalize(s: IncidentState, reportMd: string): void {
  s.finalReport = reportMd;
}

export function renderHistory(s: IncidentState): string {
  const lines: string[] = [];
  for (const step of s.steps) {
    lines.push(`STEP ${step.index}: ${step.action} ${JSON.stringify(step.args)}`);
    lines.push(`  rationale: ${step.rationale}`);
    const tool = s.toolLog.find((t) => t.step === step.index);
    if (tool) lines.push(`  result(status=${tool.status}): ${JSON.stringify(tool.result).slice(0, 500)}`);
  }
  return lines.join("\n");
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @argus/orchestrator test -- state`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/orchestrator/src/state.ts apps/orchestrator/test/state.test.ts
git commit -m "orchestrator: incident state + history rendering"
```

---

## Task 3.2: System prompt + structured-output schema

**Files:**
- Create: `apps/orchestrator/src/prompts.ts`

- [ ] **Step 1: Write `src/prompts.ts`**

```ts
export const SYSTEM_PROMPT = `\
You are Argus — an autonomous on-call SRE agent. You investigate live incidents in a small service cluster (services: api, worker, db_proxy, auth).

# Your job
Diagnose the root cause of the current incident, then emit a postmortem-style markdown report. Do NOT take remediation actions (read-only mode).

# Available tools (call exactly one per step via "action")
- search_logs(service?, q?, since_unix?, limit?) — search structured logs
- query_metrics(service?) — get Prometheus metrics text
- query_traces(service?) — get recent spans
- read_runbook(service) — read service runbook
- report() — emit the final markdown report (terminates the loop). Pass the markdown via args.markdown.

# Output schema
Respond with a SINGLE JSON object — no prose outside it — with this shape:

{
  "action": "search_logs" | "query_metrics" | "query_traces" | "read_runbook" | "report",
  "args": { ... arguments for the action ... },
  "rationale": "<one sentence explaining why this action>",
  "hypotheses": ["<current top hypothesis>", "..."]
}

# When a tool returns status=unavailable
The tool result envelope will contain {status: "unavailable", last_known, hint}. Continue using cached data, try an alternative tool, or note the gap in your final report.

# When done
Call action=report with args={"markdown": "<the full postmortem md>"}. The report must contain: Summary, Timeline, Root Cause, Evidence, Suggested Remediation.
`;
```

- [ ] **Step 2: Commit (no test — pure data)**

```bash
git add apps/orchestrator/src/prompts.ts
git commit -m "orchestrator: system prompt + output schema"
```

---

## Task 3.3: MCP pool (basic — no resilience yet)

**Files:**
- Create: `apps/orchestrator/src/mcp-pool.ts`
- Test: `apps/orchestrator/test/mcp-pool.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect, vi } from "vitest";
import { McpPool, type McpServerCall } from "../src/mcp-pool.js";

describe("McpPool (basic)", () => {
  it("dispatches calls to the configured server by tool name", async () => {
    const callMock = vi.fn(async (server: string, tool: string, args: unknown) => ({ ok: true, server, tool, args }));
    const pool = new McpPool({
      tools: {
        search_logs: "logs",
        query_metrics: "metrics",
        query_traces: "traces",
        read_runbook: "runbook",
      },
      call: callMock,
    });
    const r = await pool.invoke({ step: 0, tool: "search_logs", args: { q: "OOM" } });
    expect(r.status).toBe("ok");
    expect(r.tool).toBe("search_logs");
    expect(callMock).toHaveBeenCalledWith("logs", "search_logs", { q: "OOM" });
  });

  it("returns error envelope when call throws", async () => {
    const pool = new McpPool({
      tools: { search_logs: "logs" } as Record<string, string>,
      call: async () => {
        throw new Error("nope");
      },
    });
    const r = await pool.invoke({ step: 0, tool: "search_logs", args: {} });
    expect(r.status).toBe("error");
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `pnpm --filter @argus/orchestrator test -- mcp-pool`
Expected: FAIL.

- [ ] **Step 3: Write `src/mcp-pool.ts`** (basic version — circuit breaker added in Phase 6)

```ts
import type { ToolCallRecord } from "./types.js";

export interface McpServerCall {
  step: number;
  tool: string;
  args: Record<string, unknown>;
}

export interface McpPoolOpts {
  tools: Record<string, string>;
  call: (server: string, tool: string, args: Record<string, unknown>) => Promise<unknown>;
}

export class McpPool {
  constructor(private opts: McpPoolOpts) {}

  async invoke(req: McpServerCall): Promise<ToolCallRecord> {
    const server = this.opts.tools[req.tool];
    if (!server) {
      return {
        step: req.step,
        tool: req.tool,
        args: req.args,
        result: { error: `unknown tool ${req.tool}` },
        durationMs: 0,
        status: "error",
      };
    }
    const t0 = Date.now();
    try {
      const result = await this.opts.call(server, req.tool, req.args);
      return {
        step: req.step,
        tool: req.tool,
        args: req.args,
        result,
        durationMs: Date.now() - t0,
        status: "ok",
      };
    } catch (err) {
      return {
        step: req.step,
        tool: req.tool,
        args: req.args,
        result: { error: (err as Error).message },
        durationMs: Date.now() - t0,
        status: "error",
      };
    }
  }
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @argus/orchestrator test -- mcp-pool`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/orchestrator/src/mcp-pool.ts apps/orchestrator/test/mcp-pool.test.ts
git commit -m "orchestrator: basic mcp pool"
```

---

## Task 3.4: Real MCP transport (stdio process spawn)

**Files:**
- Create: `apps/orchestrator/src/mcp-stdio.ts`

- [ ] **Step 1: Write `src/mcp-stdio.ts`**

```ts
import { spawn, type ChildProcess } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const SERVERS: Record<string, { cmd: string; args: string[] }> = {
  logs:     { cmd: "pnpm", args: ["--filter", "@argus/mcp", "logs"] },
  metrics:  { cmd: "pnpm", args: ["--filter", "@argus/mcp", "metrics"] },
  traces:   { cmd: "pnpm", args: ["--filter", "@argus/mcp", "traces"] },
  runbook:  { cmd: "pnpm", args: ["--filter", "@argus/mcp", "runbook"] },
};

export class StdioMcpClients {
  private clients = new Map<string, Client>();
  private procs = new Map<string, ChildProcess>();

  async connectAll(): Promise<void> {
    for (const [name, spec] of Object.entries(SERVERS)) {
      const proc = spawn(spec.cmd, spec.args, { stdio: ["pipe", "pipe", "inherit"] });
      this.procs.set(name, proc);
      const transport = new StdioClientTransport({
        command: spec.cmd,
        args: spec.args,
      });
      const client = new Client({ name: `argus-orchestrator-${name}`, version: "0.1.0" }, { capabilities: {} });
      await client.connect(transport);
      this.clients.set(name, client);
    }
  }

  async call(server: string, tool: string, args: Record<string, unknown>): Promise<unknown> {
    const client = this.clients.get(server);
    if (!client) throw new Error(`mcp server not connected: ${server}`);
    const res = await client.callTool({ name: tool, arguments: args });
    return res.content;
  }

  async closeAll(): Promise<void> {
    for (const client of this.clients.values()) {
      try { await client.close(); } catch {}
    }
    for (const proc of this.procs.values()) {
      try { proc.kill(); } catch {}
    }
  }
}
```

- [ ] **Step 2: Commit (integration verified at end of phase)**

```bash
git add apps/orchestrator/src/mcp-stdio.ts
git commit -m "orchestrator: stdio MCP client (spawn + connect)"
```

---

## Task 3.5: Conductor — single-provider loop

**Files:**
- Create: `apps/orchestrator/src/conductor.ts`
- Test: `apps/orchestrator/test/conductor.test.ts`

- [ ] **Step 1: Write failing integration test**

```ts
import { describe, it, expect, vi } from "vitest";
import { runConductor } from "../src/conductor.js";
import { McpPool } from "../src/mcp-pool.js";
import type { GatewayClient } from "../src/gateway.js";

describe("Conductor (single provider)", () => {
  it("walks the loop and terminates on report", async () => {
    const scripted = [
      { action: "search_logs", args: { service: "worker", q: "OOM" }, rationale: "look", hypotheses: ["leak"] },
      { action: "query_metrics", args: { service: "worker" }, rationale: "trend", hypotheses: ["leak"] },
      { action: "report", args: { markdown: "# Root cause\nworker OOM" }, rationale: "done", hypotheses: ["leak"] },
    ];
    let idx = 0;
    const gw = {
      chat: vi.fn(async () => ({
        text: JSON.stringify(scripted[idx++]),
        latencyMs: 10,
        provider: "claude" as const,
        via: "gateway" as const,
      })),
      setMode: vi.fn(),
      getMode: () => "gateway" as const,
    } as unknown as GatewayClient;

    const pool = new McpPool({
      tools: { search_logs: "logs", query_metrics: "metrics", query_traces: "traces", read_runbook: "runbook" },
      call: async () => ({ ok: true, fake: true }),
    });

    const events: unknown[] = [];
    const result = await runConductor({
      gateway: gw,
      pool,
      incidentId: "inc_x",
      primaryModel: "claude-x",
      shadowModel: "nemotron-x",
      maxSteps: 5,
      enableShadow: false,
      emit: (e) => events.push(e),
    });

    expect(result.finalReport).toContain("Root cause");
    expect(result.steps.length).toBe(3);
    expect(result.toolLog.length).toBe(2);
    expect(events.some((e: any) => e.type === "incident_done")).toBe(true);
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `pnpm --filter @argus/orchestrator test -- conductor`
Expected: FAIL.

- [ ] **Step 3: Write `src/conductor.ts`**

```ts
import { createIncident, appendStep, appendToolResult, finalize, renderHistory } from "./state.js";
import { SYSTEM_PROMPT } from "./prompts.js";
import type { GatewayClient } from "./gateway.js";
import type { McpPool } from "./mcp-pool.js";
import type { AgentAction, AgentStep, IncidentState, ProviderName } from "./types.js";

export interface ConductorEvent {
  type:
    | "step_start"
    | "primary_step"
    | "shadow_step"
    | "tool_call"
    | "tool_result"
    | "divergence"
    | "failover"
    | "gateway_mode"
    | "incident_done";
  data: Record<string, unknown>;
}

export interface ConductorOpts {
  gateway: GatewayClient;
  pool: McpPool;
  incidentId: string;
  primaryModel: string;
  shadowModel: string;
  maxSteps: number;
  enableShadow: boolean;
  emit?: (e: ConductorEvent) => void;
}

export async function runConductor(opts: ConductorOpts): Promise<IncidentState> {
  const s = createIncident(opts.incidentId, SYSTEM_PROMPT);
  const emit = opts.emit ?? (() => {});

  for (let step = 0; step < opts.maxSteps; step++) {
    emit({ type: "step_start", data: { step } });

    const messages = buildMessages(s);
    const primary = await opts.gateway.chat({
      provider: s.primary,
      model: opts.primaryModel,
      messages,
      temperature: 0,
      responseFormat: "json_object",
    });
    emit({ type: "primary_step", data: { step, text: primary.text, provider: s.primary } });

    let parsed: AgentStep | null;
    try {
      parsed = parseStep(step, primary.text);
    } catch (err) {
      // ask agent to retry with a corrective message
      s.messages.push({ role: "assistant", content: primary.text });
      s.messages.push({ role: "user", content: `Your last message was not valid JSON. Error: ${(err as Error).message}. Reply with a SINGLE JSON object matching the schema.` });
      continue;
    }

    appendStep(s, parsed);

    if (parsed.action === "report") {
      const md = String(parsed.args.markdown ?? "");
      finalize(s, md);
      emit({ type: "incident_done", data: { report_md: md } });
      return s;
    }

    emit({ type: "tool_call", data: { step, tool: parsed.action, args: parsed.args } });
    const toolResult = await opts.pool.invoke({ step, tool: parsed.action, args: parsed.args });
    appendToolResult(s, toolResult);
    emit({ type: "tool_result", data: { step, status: toolResult.status, result: toolResult.result } });
  }

  finalize(s, "# Investigation incomplete\nMax steps reached without a report.");
  emit({ type: "incident_done", data: { report_md: s.finalReport } });
  return s;
}

function buildMessages(s: IncidentState) {
  return [
    { role: "system" as const, content: s.messages[0]!.content },
    {
      role: "user" as const,
      content: `Current incident: ${s.id}.\nHistory so far:\n${renderHistory(s) || "(no steps yet)"}\n\nDecide your next single action and reply with a JSON object.`,
    },
  ];
}

function parseStep(index: number, raw: string): AgentStep {
  const trimmed = stripCodeFence(raw).trim();
  const parsed = JSON.parse(trimmed) as { action: string; args?: Record<string, unknown>; rationale?: string; hypotheses?: string[] };
  const validActions: AgentAction[] = ["search_logs", "query_metrics", "query_traces", "read_runbook", "report"];
  if (!validActions.includes(parsed.action as AgentAction)) {
    throw new Error(`invalid action "${parsed.action}"`);
  }
  return {
    index,
    action: parsed.action as AgentAction,
    args: parsed.args ?? {},
    rationale: parsed.rationale ?? "",
    hypotheses: parsed.hypotheses ?? [],
  };
}

function stripCodeFence(s: string): string {
  const match = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  return match ? match[1]! : s;
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @argus/orchestrator test -- conductor`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/orchestrator/src/conductor.ts apps/orchestrator/test/conductor.test.ts
git commit -m "orchestrator: conductor single-provider loop"
```

---

## Task 3.6: HTTP server + SSE

**Files:**
- Create: `apps/orchestrator/src/server.ts`
- Modify: `apps/orchestrator/src/index.ts`

- [ ] **Step 1: Write `src/server.ts`**

```ts
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { GatewayClient } from "./gateway.js";
import { McpPool } from "./mcp-pool.js";
import { StdioMcpClients } from "./mcp-stdio.js";
import { runConductor, type ConductorEvent } from "./conductor.js";
import { ProviderRegistry } from "./providers.js";

interface AppDeps {
  gateway: GatewayClient;
  pool: McpPool;
  registry: ProviderRegistry;
  chaosState: {
    killClaude: boolean;
    killNemotron: boolean;
    gatewayDown: boolean;
  };
}

export function buildApp(deps: AppDeps) {
  const app = new Hono();
  const incidents = new Map<string, { events: ConductorEvent[]; subs: Array<(e: ConductorEvent) => void>; done: boolean }>();

  app.get("/health", (c) => c.json({ ok: true }));

  app.post("/incident/:id/start", async (c) => {
    const id = c.req.param("id");
    if (incidents.has(id)) return c.json({ ok: false, error: "already started" }, 400);
    const entry = { events: [] as ConductorEvent[], subs: [] as Array<(e: ConductorEvent) => void>, done: false };
    incidents.set(id, entry);

    runConductor({
      gateway: deps.gateway,
      pool: deps.pool,
      incidentId: id,
      primaryModel: process.env.CLAUDE_MODEL!,
      shadowModel: process.env.NEMOTRON_MODEL!,
      maxSteps: 12,
      enableShadow: true,
      emit: (e) => {
        entry.events.push(e);
        for (const fn of entry.subs) fn(e);
        if (e.type === "incident_done") {
          entry.done = true;
        }
      },
    }).catch((err: unknown) => {
      const errMsg = err instanceof Error ? err.message : String(err);
      const e: ConductorEvent = { type: "incident_done", data: { error: errMsg } };
      entry.events.push(e);
      for (const fn of entry.subs) fn(e);
      entry.done = true;
    });

    return c.json({ ok: true });
  });

  app.get("/incident/:id/stream", (c) =>
    streamSSE(c, async (stream) => {
      const id = c.req.param("id");
      const entry = incidents.get(id);
      if (!entry) {
        await stream.writeSSE({ event: "error", data: JSON.stringify({ error: "not_found" }) });
        return;
      }
      for (const e of entry.events) {
        await stream.writeSSE({ event: e.type, data: JSON.stringify(e.data) });
      }
      if (entry.done) return;
      await new Promise<void>((resolve) => {
        const fn = (e: ConductorEvent) => {
          stream.writeSSE({ event: e.type, data: JSON.stringify(e.data) }).catch(() => {});
          if (e.type === "incident_done") {
            entry.subs.splice(entry.subs.indexOf(fn), 1);
            resolve();
          }
        };
        entry.subs.push(fn);
      });
    }),
  );

  app.post("/chaos/kill-provider", async (c) => {
    const body = await c.req.json<{ provider: "claude" | "nemotron" }>();
    if (body.provider === "claude") deps.chaosState.killClaude = true;
    if (body.provider === "nemotron") deps.chaosState.killNemotron = true;
    deps.gateway.setProviderBlocked(body.provider, true);
    return c.json({ ok: true });
  });

  app.post("/chaos/restore-provider", async (c) => {
    const body = await c.req.json<{ provider: "claude" | "nemotron" }>();
    if (body.provider === "claude") deps.chaosState.killClaude = false;
    if (body.provider === "nemotron") deps.chaosState.killNemotron = false;
    deps.gateway.setProviderBlocked(body.provider, false);
    return c.json({ ok: true });
  });

  app.post("/chaos/sever-gateway", async (c) => {
    deps.chaosState.gatewayDown = true;
    deps.gateway.setMode("direct");
    return c.json({ ok: true });
  });

  app.post("/chaos/restore-gateway", async (c) => {
    deps.chaosState.gatewayDown = false;
    deps.gateway.setMode("gateway");
    return c.json({ ok: true });
  });

  return { app, incidents };
}
```

- [ ] **Step 2: Wire chaos state into Gateway client (modify gateway.ts)**

Open `apps/orchestrator/src/gateway.ts` and add a hook for in-process chaos. Add this method to the class:

```ts
  private blockedProviders = new Set<string>();

  setProviderBlocked(provider: ProviderName, blocked: boolean): void {
    if (blocked) this.blockedProviders.add(provider);
    else this.blockedProviders.delete(provider);
  }
```

Then at the top of `chat()`, after the body construction and before the fetch, add:

```ts
    if (this.blockedProviders.has(req.provider)) {
      throw new GatewayError("provider killed by chaos", 503, req.provider);
    }
```

Run tests: `pnpm --filter @argus/orchestrator test -- gateway`
Expected: still pass.

- [ ] **Step 3: Replace `src/index.ts`**

```ts
import "dotenv/config";
import { serve } from "@hono/node-server";
import { buildApp } from "./server.js";
import { GatewayClient } from "./gateway.js";
import { McpPool } from "./mcp-pool.js";
import { StdioMcpClients } from "./mcp-stdio.js";
import { ProviderRegistry } from "./providers.js";

const PORT = Number(process.env.PORT ?? 7200);

const gateway = new GatewayClient({
  gatewayUrl: process.env.TRUEFOUNDRY_GATEWAY_URL ?? "https://app.truefoundry.com/api/llm/v1",
  gatewayKey: process.env.TRUEFOUNDRY_API_KEY ?? "",
  directKeys: {
    claude: process.env.ANTHROPIC_API_KEY ?? "",
    nemotron: process.env.CRUSOE_API_KEY ?? "",
  },
  directUrls: {
    claude: "https://api.anthropic.com/v1",
    nemotron: process.env.CRUSOE_INFERENCE_URL ?? "",
  },
});

if (!process.env.TRUEFOUNDRY_API_KEY) {
  console.warn("[argus] no TRUEFOUNDRY_API_KEY; booting in direct mode");
  gateway.setMode("direct");
}

const mcpClients = new StdioMcpClients();
await mcpClients.connectAll();

const pool = new McpPool({
  tools: {
    search_logs: "logs",
    query_metrics: "metrics",
    query_traces: "traces",
    read_runbook: "runbook",
  },
  call: (server, tool, args) => mcpClients.call(server, tool, args),
});

const registry = new ProviderRegistry(["claude", "nemotron"], { quarantineMs: 60_000 });
const chaosState = { killClaude: false, killNemotron: false, gatewayDown: false };

const { app } = buildApp({ gateway, pool, registry, chaosState });

serve({ fetch: app.fetch, port: PORT }, ({ port }) => {
  console.log(`[argus] orchestrator on :${port}`);
});

process.on("SIGINT", async () => {
  await mcpClients.closeAll();
  process.exit(0);
});
```

- [ ] **Step 4: Boot end-to-end (manual smoke)**

In separate terminals:
```bash
pnpm dev:cluster     # terminal A
pnpm dev:orch        # terminal B
```

Then start an incident:
```bash
curl -X POST http://127.0.0.1:7200/incident/inc_smoke/start
curl -N http://127.0.0.1:7200/incident/inc_smoke/stream
```

Expected: SSE events stream; eventually `incident_done` arrives. If the LLM is hitting real APIs this confirms end-to-end works.

- [ ] **Step 5: Commit**

```bash
git add apps/orchestrator/src
git commit -m "orchestrator: HTTP server with SSE + chaos endpoints"
```

---

# Phase 4 — Shadow execution + divergence + failover (Day 4, Sat 2026-05-24)

## Task 4.1: Divergence detector

**Files:**
- Create: `apps/orchestrator/src/divergence.ts`
- Test: `apps/orchestrator/test/divergence.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from "vitest";
import { compareSteps } from "../src/divergence.js";
import type { AgentStep } from "../src/types.js";

const baseStep: AgentStep = {
  index: 0,
  action: "search_logs",
  args: { service: "worker", q: "OOM" },
  rationale: "look for OOM in worker logs",
  hypotheses: ["leak"],
};

describe("compareSteps", () => {
  it("identical → not flagged, high score", () => {
    const r = compareSteps(0, baseStep, baseStep);
    expect(r.actionMismatch).toBe(false);
    expect(r.argsMismatch).toBe(false);
    expect(r.flagged).toBe(false);
  });

  it("different action → flagged", () => {
    const r = compareSteps(0, baseStep, { ...baseStep, action: "query_metrics" });
    expect(r.actionMismatch).toBe(true);
    expect(r.flagged).toBe(true);
  });

  it("same action different args → args mismatch, flagged", () => {
    const r = compareSteps(0, baseStep, { ...baseStep, args: { service: "api", q: "OOM" } });
    expect(r.actionMismatch).toBe(false);
    expect(r.argsMismatch).toBe(true);
    expect(r.flagged).toBe(true);
  });

  it("similar rationale → not flagged on text alone", () => {
    const r = compareSteps(0, baseStep, { ...baseStep, rationale: "investigate OOM hits in worker" });
    expect(r.actionMismatch).toBe(false);
    expect(r.argsMismatch).toBe(false);
    expect(r.flagged).toBe(false);
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `pnpm --filter @argus/orchestrator test -- divergence`
Expected: FAIL.

- [ ] **Step 3: Write `src/divergence.ts`**

```ts
import type { AgentStep, DivergenceScore } from "./types.js";

export function compareSteps(step: number, primary: AgentStep, shadow: AgentStep): DivergenceScore {
  const actionMismatch = primary.action !== shadow.action;
  const argsMismatch = !actionMismatch && !stableEqual(primary.args, shadow.args);
  const rationaleCosine = jaccardCosine(primary.rationale, shadow.rationale);
  const flagged = actionMismatch || argsMismatch || rationaleCosine < 0.4;

  const summary = actionMismatch
    ? `shadow chose ${shadow.action} instead of ${primary.action}`
    : argsMismatch
      ? `same action, different args`
      : rationaleCosine < 0.4
        ? `rationale divergence (cosine=${rationaleCosine.toFixed(2)})`
        : `agreement`;

  return {
    step,
    cosine: rationaleCosine,
    actionMismatch,
    argsMismatch,
    flagged,
    summary,
  };
}

function stableEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(sortDeep(a)) === JSON.stringify(sortDeep(b));
}

function sortDeep(v: unknown): unknown {
  if (v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map(sortDeep);
  const obj = v as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(obj).sort()) out[k] = sortDeep(obj[k]);
  return out;
}

function jaccardCosine(a: string, b: string): number {
  // cheap surrogate for cosine: token-set jaccard. Spec calls for cosine over
  // embeddings; pragmatic fallback that doesn't need a model. Replace later if
  // we wire an embed call.
  const ta = new Set(tokens(a));
  const tb = new Set(tokens(b));
  if (ta.size === 0 && tb.size === 0) return 1;
  const inter = [...ta].filter((t) => tb.has(t)).length;
  const denom = Math.sqrt(ta.size * tb.size);
  return denom === 0 ? 0 : inter / denom;
}

function tokens(s: string): string[] {
  return s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2);
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @argus/orchestrator test -- divergence`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/orchestrator/src/divergence.ts apps/orchestrator/test/divergence.test.ts
git commit -m "orchestrator: divergence detector (action/args/rationale)"
```

---

## Task 4.2: Failover controller

**Files:**
- Create: `apps/orchestrator/src/failover.ts`
- Test: `apps/orchestrator/test/failover.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from "vitest";
import { promoteShadow, pickNewShadow } from "../src/failover.js";
import { ProviderRegistry } from "../src/providers.js";
import type { IncidentState } from "../src/types.js";

function fakeState(): IncidentState {
  return {
    id: "x",
    startedAt: 0,
    messages: [],
    toolLog: [],
    scratchpad: "",
    hypotheses: [],
    steps: [],
    primary: "claude",
    shadow: "nemotron",
    finalReport: null,
  };
}

describe("failover", () => {
  it("promoteShadow swaps primary/shadow", () => {
    const s = fakeState();
    promoteShadow(s);
    expect(s.primary).toBe("nemotron");
    expect(s.shadow).toBeNull();
  });

  it("pickNewShadow excludes current primary + quarantined", () => {
    const s = fakeState();
    s.primary = "nemotron";
    s.shadow = null;
    const reg = new ProviderRegistry(["claude", "nemotron"], { quarantineMs: 60_000 });
    reg.markFailure("claude", Date.now());
    const pick = pickNewShadow(s, reg);
    expect(pick).toBeNull();
  });

  it("pickNewShadow returns healthy alt", () => {
    const s = fakeState();
    s.primary = "nemotron";
    s.shadow = null;
    const reg = new ProviderRegistry(["claude", "nemotron"], { quarantineMs: 60_000 });
    const pick = pickNewShadow(s, reg);
    expect(pick).toBe("claude");
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `pnpm --filter @argus/orchestrator test -- failover`
Expected: FAIL.

- [ ] **Step 3: Write `src/failover.ts`**

```ts
import type { IncidentState, ProviderName } from "./types.js";
import type { ProviderRegistry } from "./providers.js";

export function promoteShadow(s: IncidentState): void {
  if (s.shadow === null) return;
  s.primary = s.shadow;
  s.shadow = null;
}

export function pickNewShadow(s: IncidentState, reg: ProviderRegistry): ProviderName | null {
  for (const candidate of reg.healthy()) {
    if (candidate !== s.primary) return candidate;
  }
  return null;
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @argus/orchestrator test -- failover`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/orchestrator/src/failover.ts apps/orchestrator/test/failover.test.ts
git commit -m "orchestrator: failover promote + new-shadow selection"
```

---

## Task 4.3: Wire shadow execution into conductor

**Files:**
- Modify: `apps/orchestrator/src/conductor.ts`
- Test: `apps/orchestrator/test/conductor-shadow.test.ts`

- [ ] **Step 1: Write failing test for shadow lockstep + failover**

```ts
import { describe, it, expect, vi } from "vitest";
import { runConductor } from "../src/conductor.js";
import { McpPool } from "../src/mcp-pool.js";
import { ProviderRegistry } from "../src/providers.js";
import type { GatewayClient } from "../src/gateway.js";

describe("Conductor (shadow + failover)", () => {
  it("fans to primary + shadow each step", async () => {
    let primaryCalls = 0;
    let shadowCalls = 0;
    const scripted = [
      { action: "search_logs", args: { service: "worker" }, rationale: "look", hypotheses: [] },
      { action: "report", args: { markdown: "# done" }, rationale: "done", hypotheses: [] },
    ];
    let idx = 0;
    const gw = {
      chat: vi.fn(async (req: { provider: "claude" | "nemotron" }) => {
        if (req.provider === "claude") primaryCalls++;
        else shadowCalls++;
        const step = scripted[Math.floor(idx / 2)]!;
        idx++;
        return { text: JSON.stringify(step), latencyMs: 5, provider: req.provider, via: "gateway" as const };
      }),
      setMode: vi.fn(),
      getMode: () => "gateway" as const,
    } as unknown as GatewayClient;
    const pool = new McpPool({ tools: { search_logs: "logs" } as Record<string, string>, call: async () => ({ ok: true }) });
    const reg = new ProviderRegistry(["claude", "nemotron"], { quarantineMs: 60_000 });

    await runConductor({
      gateway: gw,
      pool,
      incidentId: "inc_a",
      primaryModel: "c",
      shadowModel: "n",
      maxSteps: 5,
      enableShadow: true,
      providers: reg,
      emit: () => {},
    });

    expect(primaryCalls).toBe(2);
    expect(shadowCalls).toBe(2);
  });

  it("promotes shadow on primary failure with state intact", async () => {
    const callOrder: string[] = [];
    const scripted = [
      { action: "search_logs", args: {}, rationale: "look", hypotheses: [] },
      { action: "report", args: { markdown: "# done" }, rationale: "fin", hypotheses: [] },
    ];
    let stepIdx = 0;
    const gw = {
      chat: vi.fn(async (req: { provider: "claude" | "nemotron" }) => {
        callOrder.push(req.provider);
        // primary dies on first call
        if (req.provider === "claude" && callOrder.filter((p) => p === "claude").length === 1) {
          throw new Error("provider killed by chaos");
        }
        const step = scripted[Math.min(stepIdx, scripted.length - 1)]!;
        if (req.provider === "claude" || req.provider === "nemotron") stepIdx = Math.min(stepIdx + 0.5, scripted.length - 1);
        return { text: JSON.stringify(step), latencyMs: 5, provider: req.provider, via: "gateway" as const };
      }),
      setMode: vi.fn(),
      getMode: () => "gateway" as const,
    } as unknown as GatewayClient;
    const pool = new McpPool({ tools: { search_logs: "logs" } as Record<string, string>, call: async () => ({ ok: true }) });
    const reg = new ProviderRegistry(["claude", "nemotron"], { quarantineMs: 1 });
    const events: any[] = [];

    const result = await runConductor({
      gateway: gw,
      pool,
      incidentId: "inc_b",
      primaryModel: "c",
      shadowModel: "n",
      maxSteps: 5,
      enableShadow: true,
      providers: reg,
      emit: (e) => events.push(e),
    });

    expect(events.some((e) => e.type === "failover")).toBe(true);
    expect(result.primary).toBe("nemotron");
    expect(result.finalReport).toContain("done");
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `pnpm --filter @argus/orchestrator test -- conductor-shadow`
Expected: FAIL — `providers` not accepted or shadow logic missing.

- [ ] **Step 3: Update `src/conductor.ts`** — replace existing file with this fuller version:

```ts
import { createIncident, appendStep, appendToolResult, finalize, renderHistory } from "./state.js";
import { SYSTEM_PROMPT } from "./prompts.js";
import { GatewayError, type GatewayClient } from "./gateway.js";
import type { McpPool } from "./mcp-pool.js";
import { compareSteps } from "./divergence.js";
import { promoteShadow, pickNewShadow } from "./failover.js";
import type { AgentAction, AgentStep, IncidentState, ProviderName } from "./types.js";
import type { ProviderRegistry } from "./providers.js";

export interface ConductorEvent {
  type:
    | "step_start"
    | "primary_step"
    | "shadow_step"
    | "tool_call"
    | "tool_result"
    | "divergence"
    | "failover"
    | "gateway_mode"
    | "incident_done";
  data: Record<string, unknown>;
}

export interface ConductorOpts {
  gateway: GatewayClient;
  pool: McpPool;
  incidentId: string;
  primaryModel: string;
  shadowModel: string;
  maxSteps: number;
  enableShadow: boolean;
  providers?: ProviderRegistry;
  emit?: (e: ConductorEvent) => void;
  stepTimeoutMs?: number;
}

export async function runConductor(opts: ConductorOpts): Promise<IncidentState> {
  const s = createIncident(opts.incidentId, SYSTEM_PROMPT);
  const emit = opts.emit ?? (() => {});
  const timeoutMs = opts.stepTimeoutMs ?? 30_000;

  for (let step = 0; step < opts.maxSteps; step++) {
    emit({ type: "step_start", data: { step, primary: s.primary, shadow: s.shadow } });
    const messages = buildMessages(s);

    const primaryReq = () =>
      withTimeout(
        opts.gateway.chat({
          provider: s.primary,
          model: modelFor(s.primary, opts),
          messages,
          temperature: 0,
          responseFormat: "json_object",
        }),
        timeoutMs,
      );

    let primaryRes;
    try {
      primaryRes = await primaryReq();
    } catch (err) {
      emit({ type: "failover", data: { reason: "primary_error", error: (err as Error).message, from: s.primary, to: s.shadow } });
      if (opts.providers) opts.providers.markFailure(s.primary, Date.now());
      if (s.shadow === null) {
        // no shadow → can't continue
        finalize(s, "# Investigation halted\nBoth providers unavailable.");
        emit({ type: "incident_done", data: { report_md: s.finalReport } });
        return s;
      }
      promoteShadow(s);
      if (opts.providers) {
        const newShadow = pickNewShadow(s, opts.providers);
        s.shadow = newShadow;
      }
      step--;
      continue;
    }
    emit({ type: "primary_step", data: { step, text: primaryRes.text, provider: s.primary, latencyMs: primaryRes.latencyMs } });

    let parsedPrimary: AgentStep;
    try {
      parsedPrimary = parseStep(step, primaryRes.text);
    } catch (err) {
      // retry next iteration with a corrective message
      s.messages.push({ role: "assistant", content: primaryRes.text });
      s.messages.push({ role: "user", content: `Your last message was not valid JSON. ${(err as Error).message}. Reply with a single JSON object.` });
      continue;
    }

    // Shadow runs in parallel but is non-blocking on tool execution
    let shadowPromise: Promise<AgentStep | null> = Promise.resolve(null);
    if (opts.enableShadow && s.shadow) {
      const shadowProv = s.shadow;
      shadowPromise = (async () => {
        try {
          const res = await withTimeout(
            opts.gateway.chat({
              provider: shadowProv,
              model: modelFor(shadowProv, opts),
              messages,
              temperature: 0,
              responseFormat: "json_object",
            }),
            timeoutMs,
          );
          emit({ type: "shadow_step", data: { step, text: res.text, provider: shadowProv, latencyMs: res.latencyMs } });
          try {
            return parseStep(step, res.text);
          } catch {
            return null;
          }
        } catch (err) {
          emit({ type: "shadow_step", data: { step, error: (err as Error).message, provider: shadowProv } });
          return null;
        }
      })();
    }

    appendStep(s, parsedPrimary);

    if (parsedPrimary.action === "report") {
      const md = String(parsedPrimary.args.markdown ?? "");
      finalize(s, md);
      emit({ type: "incident_done", data: { report_md: md } });
      return s;
    }

    emit({ type: "tool_call", data: { step, tool: parsedPrimary.action, args: parsedPrimary.args } });
    const toolResult = await opts.pool.invoke({ step, tool: parsedPrimary.action, args: parsedPrimary.args });
    appendToolResult(s, toolResult);
    emit({ type: "tool_result", data: { step, status: toolResult.status, result: toolResult.result } });

    const shadowStep = await shadowPromise;
    if (shadowStep) {
      const div = compareSteps(step, parsedPrimary, shadowStep);
      emit({ type: "divergence", data: div as unknown as Record<string, unknown> });
    }
  }

  finalize(s, "# Investigation incomplete\nMax steps reached without a report.");
  emit({ type: "incident_done", data: { report_md: s.finalReport } });
  return s;
}

function modelFor(provider: ProviderName, opts: ConductorOpts): string {
  return provider === "claude" ? opts.primaryModel : opts.shadowModel;
}

function buildMessages(s: IncidentState) {
  return [
    { role: "system" as const, content: s.messages[0]!.content },
    {
      role: "user" as const,
      content: `Current incident: ${s.id}.\nHistory so far:\n${renderHistory(s) || "(no steps yet)"}\n\nDecide your next single action and reply with a JSON object.`,
    },
    ...s.messages.slice(1),
  ];
}

function parseStep(index: number, raw: string): AgentStep {
  const trimmed = stripCodeFence(raw).trim();
  const parsed = JSON.parse(trimmed) as { action: string; args?: Record<string, unknown>; rationale?: string; hypotheses?: string[] };
  const validActions: AgentAction[] = ["search_logs", "query_metrics", "query_traces", "read_runbook", "report"];
  if (!validActions.includes(parsed.action as AgentAction)) {
    throw new Error(`invalid action "${parsed.action}"`);
  }
  return {
    index,
    action: parsed.action as AgentAction,
    args: parsed.args ?? {},
    rationale: parsed.rationale ?? "",
    hypotheses: parsed.hypotheses ?? [],
  };
}

function stripCodeFence(s: string): string {
  const match = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  return match ? match[1]! : s;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout ${ms}ms`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}
```

- [ ] **Step 4: Run all conductor tests**

Run: `pnpm --filter @argus/orchestrator test -- conductor`
Expected: PASS (both `conductor.test.ts` and `conductor-shadow.test.ts`).

- [ ] **Step 5: Commit**

```bash
git add apps/orchestrator/src/conductor.ts apps/orchestrator/test/conductor-shadow.test.ts
git commit -m "orchestrator: shadow execution + failover wiring"
```

---

# Phase 5 — Web UI (Day 5, Sun 2026-05-25)

## Task 5.1: SSE client + types shared with orchestrator

**Files:**
- Create: `apps/web/lib/sse.ts`
- Create: `apps/web/lib/types.ts`
- Create: `apps/web/lib/api.ts`

- [ ] **Step 1: Write `lib/types.ts`**

```ts
export type EventName =
  | "step_start"
  | "primary_step"
  | "shadow_step"
  | "tool_call"
  | "tool_result"
  | "divergence"
  | "failover"
  | "gateway_mode"
  | "incident_done";

export interface StreamEvent {
  type: EventName;
  data: Record<string, unknown>;
}
```

- [ ] **Step 2: Write `lib/api.ts`**

```ts
const ORCH = process.env.NEXT_PUBLIC_ORCH_URL ?? "http://127.0.0.1:7200";

export async function startIncident(id: string) {
  const r = await fetch(`${ORCH}/incident/${id}/start`, { method: "POST" });
  if (!r.ok) throw new Error(`start ${r.status}`);
}

export async function killProvider(provider: "claude" | "nemotron") {
  await fetch(`${ORCH}/chaos/kill-provider`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ provider }),
  });
}

export async function restoreProvider(provider: "claude" | "nemotron") {
  await fetch(`${ORCH}/chaos/restore-provider`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ provider }),
  });
}

export async function severGateway() {
  await fetch(`${ORCH}/chaos/sever-gateway`, { method: "POST" });
}

export async function restoreGateway() {
  await fetch(`${ORCH}/chaos/restore-gateway`, { method: "POST" });
}

export function streamUrl(id: string): string {
  return `${ORCH}/incident/${id}/stream`;
}
```

- [ ] **Step 3: Write `lib/sse.ts`**

```ts
"use client";
import { useEffect, useRef, useState } from "react";
import type { StreamEvent, EventName } from "./types.js";

export function useSSE(url: string | null): StreamEvent[] {
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!url) return;
    const es = new EventSource(url);
    esRef.current = es;

    const onAny = (type: EventName) => (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        setEvents((prev) => [...prev, { type, data }]);
      } catch {
        // ignore
      }
    };

    const handlers: EventName[] = [
      "step_start", "primary_step", "shadow_step",
      "tool_call", "tool_result", "divergence", "failover",
      "gateway_mode", "incident_done",
    ];
    for (const h of handlers) es.addEventListener(h, onAny(h));

    return () => es.close();
  }, [url]);

  return events;
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib
git commit -m "web: sse hook + orchestrator client"
```

---

## Task 5.2: Reasoning pane + split stream

**Files:**
- Create: `apps/web/components/reasoning-pane.tsx`
- Create: `apps/web/components/split-stream.tsx`
- Create: `apps/web/components/agreement-meter.tsx`
- Create: `apps/web/components/failover-banner.tsx`
- Create: `apps/web/components/final-report.tsx`
- Create: `apps/web/components/timeline.tsx`

- [ ] **Step 1: Write `components/reasoning-pane.tsx`**

```tsx
"use client";
import { useMemo } from "react";
import type { StreamEvent } from "@/lib/types";

export function ReasoningPane({ role, events, provider }: { role: "primary" | "shadow"; events: StreamEvent[]; provider: string }) {
  const steps = useMemo(() => {
    const type = role === "primary" ? "primary_step" : "shadow_step";
    return events.filter((e) => e.type === type);
  }, [events, role]);

  const dead = useMemo(() => {
    if (role !== "shadow") return false;
    return events.some((e) => e.type === "failover");
  }, [events, role]);

  return (
    <div className={`flex h-full flex-col border ${role === "primary" ? "border-indigo-500/40" : "border-amber-500/40"} bg-zinc-900/40 rounded-lg`}>
      <div className={`px-4 py-2 text-xs uppercase tracking-wider border-b ${role === "primary" ? "border-indigo-500/30 text-indigo-300" : "border-amber-500/30 text-amber-300"} flex justify-between`}>
        <span>{role} — {provider}</span>
        {dead && role === "shadow" ? <span className="text-rose-400">promoted → primary</span> : null}
      </div>
      <div className="flex-1 overflow-auto p-3 space-y-2 font-mono text-xs text-zinc-300">
        {steps.map((e, i) => {
          const data = e.data as { step?: number; text?: string; error?: string };
          if (data.error) {
            return <div key={i} className="rounded border border-rose-700/40 bg-rose-900/20 p-2 text-rose-300">step {data.step}: {data.error}</div>;
          }
          return (
            <div key={i} className="rounded border border-zinc-800 bg-zinc-950 p-2 whitespace-pre-wrap">
              <div className="mb-1 text-zinc-500">step {data.step}</div>
              {data.text}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write `components/split-stream.tsx`**

```tsx
"use client";
import { ReasoningPane } from "./reasoning-pane";
import { AgreementMeter } from "./agreement-meter";
import type { StreamEvent } from "@/lib/types";

export function SplitStream({ events, primary, shadow }: { events: StreamEvent[]; primary: string; shadow: string | null }) {
  return (
    <div className="grid h-[60vh] grid-cols-[1fr_140px_1fr] gap-3">
      <ReasoningPane role="primary" events={events} provider={primary} />
      <AgreementMeter events={events} />
      {shadow ? (
        <ReasoningPane role="shadow" events={events} provider={shadow} />
      ) : (
        <div className="flex h-full items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/40 text-zinc-600">
          no shadow
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Write `components/agreement-meter.tsx`**

```tsx
"use client";
import { useMemo } from "react";
import type { StreamEvent } from "@/lib/types";

export function AgreementMeter({ events }: { events: StreamEvent[] }) {
  const score = useMemo(() => {
    const divs = events.filter((e) => e.type === "divergence");
    if (divs.length === 0) return 1.0;
    const flagged = divs.filter((e) => (e.data as { flagged?: boolean }).flagged).length;
    return 1 - flagged / divs.length;
  }, [events]);

  const pct = Math.round(score * 100);
  const color = pct > 80 ? "text-emerald-400" : pct > 50 ? "text-amber-400" : "text-rose-400";

  return (
    <div className="flex h-full flex-col items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/60">
      <div className="text-xs uppercase tracking-wider text-zinc-500">Agreement</div>
      <div className={`text-5xl font-bold tabular-nums ${color}`}>{pct}%</div>
      <div className="mt-2 text-xs text-zinc-500">primary ↔ shadow</div>
    </div>
  );
}
```

- [ ] **Step 4: Write `components/failover-banner.tsx`**

```tsx
"use client";
import type { StreamEvent } from "@/lib/types";

export function FailoverBanner({ events }: { events: StreamEvent[] }) {
  const last = events.filter((e) => e.type === "failover" || e.type === "gateway_mode").slice(-1)[0];
  if (!last) return null;
  const data = last.data as { from?: string; to?: string; reason?: string; mode?: string };
  const text =
    last.type === "failover"
      ? `Primary failed (${data.reason}) → promoted ${data.to ?? "shadow"}`
      : `Gateway mode: ${data.mode}`;
  return (
    <div className="mb-3 rounded-md border border-rose-500/40 bg-rose-900/20 px-3 py-2 text-sm text-rose-200">
      {text}
    </div>
  );
}
```

- [ ] **Step 5: Write `components/final-report.tsx`**

```tsx
"use client";
import { useMemo } from "react";
import type { StreamEvent } from "@/lib/types";

export function FinalReport({ events }: { events: StreamEvent[] }) {
  const md = useMemo(() => {
    const e = events.findLast((x) => x.type === "incident_done");
    return e ? String((e.data as { report_md?: string }).report_md ?? "") : "";
  }, [events]);
  if (!md) return null;
  return (
    <div className="mt-6 rounded-lg border border-emerald-700/40 bg-emerald-950/20 p-4">
      <div className="mb-2 text-xs uppercase tracking-wider text-emerald-300">Final Report</div>
      <pre className="whitespace-pre-wrap font-mono text-sm text-zinc-200">{md}</pre>
    </div>
  );
}
```

- [ ] **Step 6: Write `components/timeline.tsx`**

```tsx
"use client";
import type { StreamEvent } from "@/lib/types";

const COLORS: Record<string, string> = {
  step_start: "bg-zinc-700",
  tool_call: "bg-indigo-600",
  tool_result: "bg-emerald-600",
  divergence: "bg-amber-600",
  failover: "bg-rose-600",
  incident_done: "bg-zinc-100",
};

export function Timeline({ events }: { events: StreamEvent[] }) {
  return (
    <div className="flex flex-wrap gap-1 rounded-md border border-zinc-800 bg-zinc-900/40 p-2 text-xs">
      {events.map((e, i) => (
        <span key={i} className={`rounded px-1.5 py-0.5 text-white/90 ${COLORS[e.type] ?? "bg-zinc-700"}`}>
          {e.type}
        </span>
      ))}
    </div>
  );
}
```

- [ ] **Step 7: Commit**

```bash
git add apps/web/components
git commit -m "web: dual-stream UI components"
```

---

## Task 5.3: Chaos panel + incident page

**Files:**
- Create: `apps/web/components/chaos-panel.tsx`
- Create: `apps/web/app/incident/[id]/page.tsx`
- Modify: `apps/web/app/page.tsx`

- [ ] **Step 1: Write `components/chaos-panel.tsx`**

```tsx
"use client";
import { useState } from "react";
import { killProvider, restoreProvider, severGateway, restoreGateway } from "@/lib/api";

export function ChaosPanel() {
  const [claudeDead, setClaudeDead] = useState(false);
  const [nemoDead, setNemoDead] = useState(false);
  const [gatewayDead, setGatewayDead] = useState(false);

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
      <div className="mb-2 text-xs uppercase tracking-wider text-zinc-500">Chaos panel</div>
      <div className="flex flex-wrap gap-2">
        <button
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${claudeDead ? "bg-emerald-700 text-white" : "bg-rose-700 text-white hover:bg-rose-600"}`}
          onClick={async () => {
            if (claudeDead) { await restoreProvider("claude"); setClaudeDead(false); }
            else { await killProvider("claude"); setClaudeDead(true); }
          }}
        >
          {claudeDead ? "Restore Claude" : "Kill Claude"}
        </button>
        <button
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${nemoDead ? "bg-emerald-700 text-white" : "bg-rose-700 text-white hover:bg-rose-600"}`}
          onClick={async () => {
            if (nemoDead) { await restoreProvider("nemotron"); setNemoDead(false); }
            else { await killProvider("nemotron"); setNemoDead(true); }
          }}
        >
          {nemoDead ? "Restore Nemotron" : "Kill Nemotron"}
        </button>
        <button
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${gatewayDead ? "bg-emerald-700 text-white" : "bg-amber-700 text-white hover:bg-amber-600"}`}
          onClick={async () => {
            if (gatewayDead) { await restoreGateway(); setGatewayDead(false); }
            else { await severGateway(); setGatewayDead(true); }
          }}
        >
          {gatewayDead ? "Restore Gateway" : "Sever Gateway"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write `app/incident/[id]/page.tsx`**

```tsx
"use client";
import { useEffect } from "react";
import { useSSE } from "@/lib/sse";
import { startIncident, streamUrl } from "@/lib/api";
import { SplitStream } from "@/components/split-stream";
import { ChaosPanel } from "@/components/chaos-panel";
import { Timeline } from "@/components/timeline";
import { FailoverBanner } from "@/components/failover-banner";
import { FinalReport } from "@/components/final-report";

export default function IncidentPage({ params }: { params: { id: string } }) {
  const events = useSSE(streamUrl(params.id));

  useEffect(() => {
    startIncident(params.id).catch(() => {});
  }, [params.id]);

  const primary = (events.findLast((e) => e.type === "primary_step")?.data as { provider?: string })?.provider ?? "claude";
  const shadow = (events.findLast((e) => e.type === "shadow_step")?.data as { provider?: string })?.provider ?? "nemotron";

  return (
    <main className="min-h-screen bg-zinc-950 p-6 text-zinc-100">
      <div className="mx-auto max-w-7xl space-y-4">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">incident · {params.id}</h1>
          <span className="text-xs text-zinc-500">argus</span>
        </header>

        <FailoverBanner events={events} />
        <Timeline events={events} />
        <SplitStream events={events} primary={primary} shadow={shadow} />
        <ChaosPanel />
        <FinalReport events={events} />
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Verify visually**

Start the cluster, orchestrator, and web app (3 terminals). Hit `http://localhost:3000/incident/inc_demo`.

Expected:
- Split-screen lights up.
- Tokens stream into both panes.
- Chaos buttons work — clicking "Kill Claude" makes the next call fail and triggers failover banner.

- [ ] **Step 4: Commit**

```bash
git add apps/web
git commit -m "web: incident page with chaos panel + split stream"
```

---

# Phase 6 — MCP resilience + Gateway direct mode (Day 6, Mon 2026-05-26)

## Task 6.1: MCP circuit breaker

**Files:**
- Modify: `apps/orchestrator/src/mcp-pool.ts`
- Test: `apps/orchestrator/test/mcp-circuit.test.ts`

- [ ] **Step 1: Write failing test for circuit breaker**

```ts
import { describe, it, expect, vi } from "vitest";
import { McpPool } from "../src/mcp-pool.js";

describe("McpPool circuit breaker", () => {
  it("opens circuit after 3 consecutive failures", async () => {
    let calls = 0;
    const pool = new McpPool({
      tools: { search_logs: "logs" } as Record<string, string>,
      call: async () => { calls++; throw new Error("boom"); },
      circuit: { failureThreshold: 3, openMs: 30_000, cacheTtlMs: 60_000 },
    });
    for (let i = 0; i < 3; i++) {
      const r = await pool.invoke({ step: i, tool: "search_logs", args: {} });
      expect(r.status).toBe("error");
    }
    const r = await pool.invoke({ step: 99, tool: "search_logs", args: {} });
    expect(r.status).toBe("synthetic");
    expect((r.result as { status?: string }).status).toBe("unavailable");
    // underlying call not invoked beyond 3
    expect(calls).toBe(3);
  });

  it("returns last_known cached value in synthetic envelope", async () => {
    let calls = 0;
    const pool = new McpPool({
      tools: { search_logs: "logs" } as Record<string, string>,
      call: async () => {
        calls++;
        if (calls === 1) return { count: 5, logs: ["ok"] };
        throw new Error("down");
      },
      circuit: { failureThreshold: 2, openMs: 30_000, cacheTtlMs: 60_000 },
    });
    const ok = await pool.invoke({ step: 0, tool: "search_logs", args: {} });
    expect(ok.status).toBe("ok");
    await pool.invoke({ step: 1, tool: "search_logs", args: {} });
    await pool.invoke({ step: 2, tool: "search_logs", args: {} });
    const synth = await pool.invoke({ step: 3, tool: "search_logs", args: {} });
    expect(synth.status).toBe("synthetic");
    const env = synth.result as { last_known: { count: number } };
    expect(env.last_known.count).toBe(5);
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `pnpm --filter @argus/orchestrator test -- mcp-circuit`
Expected: FAIL.

- [ ] **Step 3: Update `src/mcp-pool.ts`** — replace with this fuller version:

```ts
import type { ToolCallRecord } from "./types.js";

export interface McpServerCall {
  step: number;
  tool: string;
  args: Record<string, unknown>;
}

export interface CircuitConfig {
  failureThreshold: number;
  openMs: number;
  cacheTtlMs: number;
}

export interface McpPoolOpts {
  tools: Record<string, string>;
  call: (server: string, tool: string, args: Record<string, unknown>) => Promise<unknown>;
  circuit?: CircuitConfig;
}

interface ToolBreakerState {
  failures: number;
  openUntil: number;
  lastSuccess: { at: number; result: unknown } | null;
  hint: string;
}

const HINTS: Record<string, string> = {
  search_logs: "try query_metrics for current state, or read_runbook",
  query_metrics: "try search_logs to find recent error patterns",
  query_traces: "fall back to search_logs and query_metrics",
  read_runbook: "skip and continue with logs/metrics evidence",
};

export class McpPool {
  private breakers = new Map<string, ToolBreakerState>();
  private cfg: CircuitConfig;

  constructor(private opts: McpPoolOpts) {
    this.cfg = opts.circuit ?? { failureThreshold: 3, openMs: 30_000, cacheTtlMs: 5 * 60_000 };
  }

  private breaker(tool: string): ToolBreakerState {
    let b = this.breakers.get(tool);
    if (!b) {
      b = { failures: 0, openUntil: 0, lastSuccess: null, hint: HINTS[tool] ?? "" };
      this.breakers.set(tool, b);
    }
    return b;
  }

  async invoke(req: McpServerCall): Promise<ToolCallRecord> {
    const server = this.opts.tools[req.tool];
    if (!server) {
      return { step: req.step, tool: req.tool, args: req.args, result: { error: `unknown tool ${req.tool}` }, durationMs: 0, status: "error" };
    }
    const b = this.breaker(req.tool);
    const now = Date.now();

    if (now < b.openUntil) {
      return this.synthetic(req, b, "circuit_open");
    }

    const t0 = Date.now();
    try {
      const result = await this.opts.call(server, req.tool, req.args);
      b.failures = 0;
      b.lastSuccess = { at: Date.now(), result };
      return { step: req.step, tool: req.tool, args: req.args, result, durationMs: Date.now() - t0, status: "ok" };
    } catch (err) {
      b.failures += 1;
      if (b.failures >= this.cfg.failureThreshold) {
        b.openUntil = Date.now() + this.cfg.openMs;
        b.failures = 0;
      }
      return { step: req.step, tool: req.tool, args: req.args, result: { error: (err as Error).message }, durationMs: Date.now() - t0, status: "error" };
    }
  }

  private synthetic(req: McpServerCall, b: ToolBreakerState, reason: string): ToolCallRecord {
    const now = Date.now();
    const cacheValid = b.lastSuccess && now - b.lastSuccess.at < this.cfg.cacheTtlMs;
    return {
      step: req.step,
      tool: req.tool,
      args: req.args,
      result: {
        status: "unavailable",
        reason,
        hint: b.hint,
        last_known: cacheValid ? b.lastSuccess!.result : null,
      },
      durationMs: 0,
      status: "synthetic",
    };
  }
}
```

- [ ] **Step 4: Run all MCP tests**

Run: `pnpm --filter @argus/orchestrator test -- mcp`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/orchestrator/src/mcp-pool.ts apps/orchestrator/test/mcp-circuit.test.ts
git commit -m "orchestrator: mcp circuit breaker + synthetic envelope"
```

---

## Task 6.2: Gateway direct-mode banner + automatic fallback

**Files:**
- Modify: `apps/orchestrator/src/server.ts`
- Modify: `apps/orchestrator/src/conductor.ts`

- [ ] **Step 1: Emit `gateway_mode` event on mode change**

Open `apps/orchestrator/src/server.ts` and modify the two Gateway chaos handlers to emit an event into every active incident stream. Replace the two handlers with:

```ts
  app.post("/chaos/sever-gateway", async (c) => {
    deps.chaosState.gatewayDown = true;
    deps.gateway.setMode("direct");
    for (const entry of incidents.values()) {
      const e = { type: "gateway_mode" as const, data: { mode: "direct" } };
      entry.events.push(e);
      for (const fn of entry.subs) fn(e);
    }
    return c.json({ ok: true });
  });

  app.post("/chaos/restore-gateway", async (c) => {
    deps.chaosState.gatewayDown = false;
    deps.gateway.setMode("gateway");
    for (const entry of incidents.values()) {
      const e = { type: "gateway_mode" as const, data: { mode: "gateway" } };
      entry.events.push(e);
      for (const fn of entry.subs) fn(e);
    }
    return c.json({ ok: true });
  });
```

- [ ] **Step 2: Add automatic mode-flip on consecutive Gateway 5xx**

In `apps/orchestrator/src/gateway.ts`, add a counter and auto-flip. Modify the `chat()` method to track gateway-mode failures:

```ts
  private gatewayFailures = 0;

  // ... inside chat(), after `throw new GatewayError(...)` for non-2xx:
  // replace the existing throw block with:

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      if (this.mode === "gateway") {
        this.gatewayFailures += 1;
        if (this.gatewayFailures >= 3 && this.opts.directKeys[req.provider]) {
          this.mode = "direct";
          this.gatewayFailures = 0;
        }
      }
      throw new GatewayError(`status ${res.status}: ${text.slice(0, 200)}`, res.status, req.provider);
    }

  // and after successful response, reset the counter:
  // (place after `const text = json.choices[0]?.message?.content ?? "";`)
    this.gatewayFailures = 0;
```

Run gateway tests: `pnpm --filter @argus/orchestrator test -- gateway`
Expected: existing tests still pass (auto-flip is conditional and doesn't trigger in unit tests with single failures).

- [ ] **Step 3: Surface the mode in the UI**

Open `apps/web/components/failover-banner.tsx` — it already handles `gateway_mode` events, so no change needed.

- [ ] **Step 4: Manual smoke**

Boot everything, start an incident, then:
```bash
curl -X POST http://127.0.0.1:7200/chaos/sever-gateway
```
Expected: UI shows "Gateway mode: direct" banner. Reasoning continues uninterrupted.

- [ ] **Step 5: Commit**

```bash
git add apps/orchestrator/src/server.ts apps/orchestrator/src/gateway.ts
git commit -m "orchestrator: gateway mode events + auto direct-mode fallback"
```

---

## Task 6.3: End-to-end resilience integration test

**Files:**
- Create: `apps/orchestrator/test/e2e-resilience.test.ts`

- [ ] **Step 1: Write integration test**

```ts
import { describe, it, expect, vi } from "vitest";
import { runConductor } from "../src/conductor.js";
import { McpPool } from "../src/mcp-pool.js";
import { ProviderRegistry } from "../src/providers.js";
import type { GatewayClient } from "../src/gateway.js";

describe("E2E resilience", () => {
  it("survives provider death + MCP failure in same run", async () => {
    const scripted = [
      { action: "search_logs", args: { service: "worker", q: "OOM" }, rationale: "look for OOM", hypotheses: [] },
      { action: "query_metrics", args: { service: "worker" }, rationale: "trend check", hypotheses: [] },
      { action: "report", args: { markdown: "# Root cause\nWorker OOM. Note: metrics tool unavailable mid-run." }, rationale: "fin", hypotheses: [] },
    ];
    const calls: string[] = [];
    let stepIdx = 0;
    const gw = {
      chat: vi.fn(async (req: { provider: "claude" | "nemotron" }) => {
        calls.push(`${req.provider}:${stepIdx}`);
        // kill claude on step 1
        if (req.provider === "claude" && stepIdx === 1) {
          throw new Error("primary down");
        }
        const step = scripted[Math.min(stepIdx, scripted.length - 1)]!;
        if (req.provider === "claude") stepIdx++;
        return { text: JSON.stringify(step), latencyMs: 5, provider: req.provider, via: "gateway" as const };
      }),
      setMode: vi.fn(),
      getMode: () => "gateway" as const,
    } as unknown as GatewayClient;
    let metricsCalls = 0;
    const pool = new McpPool({
      tools: { search_logs: "logs", query_metrics: "metrics" } as Record<string, string>,
      call: async (_s, tool) => {
        if (tool === "query_metrics") {
          metricsCalls++;
          throw new Error("metrics down");
        }
        return { ok: true };
      },
      circuit: { failureThreshold: 1, openMs: 30_000, cacheTtlMs: 60_000 },
    });
    const reg = new ProviderRegistry(["claude", "nemotron"], { quarantineMs: 1 });
    const events: any[] = [];
    const result = await runConductor({
      gateway: gw,
      pool,
      incidentId: "e2e",
      primaryModel: "c",
      shadowModel: "n",
      maxSteps: 6,
      enableShadow: true,
      providers: reg,
      emit: (e) => events.push(e),
    });
    expect(events.some((e) => e.type === "failover")).toBe(true);
    expect(events.some((e) => e.type === "tool_result" && (e.data as any).status === "synthetic")).toBe(true);
    expect(result.finalReport).toContain("Root cause");
  });
});
```

- [ ] **Step 2: Run all tests**

Run: `pnpm --filter @argus/orchestrator test`
Expected: all PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/orchestrator/test/e2e-resilience.test.ts
git commit -m "orchestrator: e2e resilience integration test"
```

---

# Phase 7 — Demo polish + 2nd scenario + rehearsal (Day 7, Tue 2026-05-27)

## Task 7.1: Demo scenario trigger script

**Files:**
- Create: `scripts/demo-worker-oom.sh`
- Create: `scripts/demo-db-saturation.sh`
- Create: `scripts/chaos-rehearsal.sh`

- [ ] **Step 1: Write `scripts/demo-worker-oom.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail
CLUSTER="${MOCK_CLUSTER_URL:-http://127.0.0.1:7100}"
ORCH="${ORCHESTRATOR_URL:-http://127.0.0.1:7200}"
ID="${1:-demo-worker-oom-$(date +%s)}"

echo "→ inject memleak on worker"
curl -fsS -X POST "$CLUSTER/chaos/inject" \
  -H 'content-type: application/json' \
  -d '{"type":"memleak","target":"worker","duration_s":120,"params":{"mb_per_tick":120}}' >/dev/null

echo "→ wait for OOM (about 10 s)"
sleep 12

echo "→ start incident $ID"
curl -fsS -X POST "$ORCH/incident/$ID/start" >/dev/null

echo "→ open http://localhost:3000/incident/$ID"
echo "$ID"
```

- [ ] **Step 2: Write `scripts/demo-db-saturation.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail
CLUSTER="${MOCK_CLUSTER_URL:-http://127.0.0.1:7100}"
ORCH="${ORCHESTRATOR_URL:-http://127.0.0.1:7200}"
ID="${1:-demo-db-saturation-$(date +%s)}"

echo "→ inject slow_query on db_proxy"
curl -fsS -X POST "$CLUSTER/chaos/inject" \
  -H 'content-type: application/json' \
  -d '{"type":"slow_query","target":"db_proxy","duration_s":120,"params":{"ms":1500}}' >/dev/null

# Generate background load to saturate the pool
echo "→ generating load on api → db_proxy"
for i in {1..30}; do
  curl -fsS "http://127.0.0.1:7101/process/job_$i" >/dev/null &
done
sleep 3

echo "→ start incident $ID"
curl -fsS -X POST "$ORCH/incident/$ID/start" >/dev/null

echo "→ open http://localhost:3000/incident/$ID"
echo "$ID"
```

- [ ] **Step 3: Write `scripts/chaos-rehearsal.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail
ORCH="${ORCHESTRATOR_URL:-http://127.0.0.1:7200}"
echo "rehearsal — will fire chaos against the active incident"

sleep 25 && echo "T+25: kill Claude" && curl -fsS -X POST "$ORCH/chaos/kill-provider" -H 'content-type: application/json' -d '{"provider":"claude"}' >/dev/null
sleep 30 && echo "T+55: sever Gateway" && curl -fsS -X POST "$ORCH/chaos/sever-gateway" >/dev/null
sleep 30 && echo "T+85: restore Gateway" && curl -fsS -X POST "$ORCH/chaos/restore-gateway" >/dev/null
sleep 15 && echo "T+100: restore Claude" && curl -fsS -X POST "$ORCH/chaos/restore-provider" -H 'content-type: application/json' -d '{"provider":"claude"}' >/dev/null
```

- [ ] **Step 4: Make scripts executable + commit**

```bash
chmod +x scripts/*.sh
git add scripts
git commit -m "scripts: demo scenarios + chaos rehearsal"
```

---

## Task 7.2: Dry-run demo end-to-end

- [ ] **Step 1: Boot all three services**

In three terminals:
```bash
pnpm dev:cluster
pnpm dev:orch
pnpm dev:web
```

- [ ] **Step 2: Run a full demo**

```bash
./scripts/demo-worker-oom.sh demo1
# open http://localhost:3000/incident/demo1 in a browser
./scripts/chaos-rehearsal.sh
```

- [ ] **Step 3: Observe + capture issues**

Expected user-visible flow on the page:
- Tokens stream into both panes.
- Agreement meter shifts.
- At ~25 s the failover banner fires; shadow promotes; primary pane shows new provider.
- At ~55 s gateway-mode banner shows "direct".
- Investigation completes with a markdown report.

Fix any visible bugs. Common issues to watch for:
- LLM emits markdown around the JSON → already handled by `stripCodeFence`; if you see retries, tighten the prompt.
- Tool result too long → already truncated to 500 chars in history; if model misses signal, raise the cap to 2000.
- Shadow falls multiple steps behind primary → shadow promise is awaited at end of step, so this can't happen in current design.

- [ ] **Step 4: Commit any UI polish**

```bash
git add -A
git commit -m "polish: demo dry-run fixes" --allow-empty
```

---

## Task 7.3: Devpost write-up draft

**Files:**
- Create: `docs/DEVPOST.md`

- [ ] **Step 1: Write `docs/DEVPOST.md`**

```markdown
# Argus — Devpost submission

## Elevator pitch
Highly-available web servers run on N machines. Why don't agents?

## Inspiration
Every team building agents hits this pain the moment they go to production: the LLM blinks, the agent dies. Existing answers are retry loops — fundamentally single-cognition, fundamentally exposed.

## What it does
Argus is an autonomous on-call SRE agent that investigates live incidents while surviving the infrastructure chaos it is responding to. Two cognitions — Claude (primary) and Nemotron-on-Crusoe (shadow) — execute the investigation in lockstep through TrueFoundry's AI Gateway. When the primary degrades, the shadow takes over with zero context loss. When they disagree, that disagreement is itself a hallucination signal.

## How we built it
- **Next.js 16** App Router web UI with split-screen dual-cognition streaming.
- **Node.js orchestrator** using AI SDK v6 patterns.
- **TrueFoundry AI Gateway** for provider routing + automatic direct-mode fallback when the Gateway itself fails.
- **Crusoe Cloud Managed Inference** hosts Nemotron as the shadow cognition.
- **MCP** servers wrap our (mock) observability stack: logs / metrics / traces / runbook. Each is wrapped with retry + circuit breaker + synthetic-response fallback.
- **Python FastAPI** mock service cluster (api / worker / db_proxy / auth) with chaos injection endpoints.

## Challenges we ran into
- Shadow execution at scale: keeping two LLM streams synchronized while only executing one set of tool calls.
- Detecting "brownout" (slow but not failed) without an embedding model: ended up using token-set similarity as a pragmatic surrogate.
- Failover across mid-flight tool calls — punted; failover happens between steps in MVP.

## Accomplishments we're proud of
- Live demo: kill Claude mid-investigation. Nemotron carries the reasoning. Zero rebuild.
- Live demo: sever TrueFoundry Gateway. Direct-mode kicks in. Investigation completes.
- Dual cognition is a feature, not just a fallback — it's a built-in hallucination detector.

## What we learned
- Active-active is the right pattern for agents under production conditions.
- The Gateway abstraction earns its complexity the moment chaos hits.

## What's next
- Real observability plug (Sentry/Datadog MCP) — chaos hooks become unnecessary.
- Approval-gated remediation mode → autonomous remediation.
- Predictive brownout detection from latency telemetry.

## Built with
Next.js 16, React 19, AI SDK v6, TrueFoundry AI Gateway, Crusoe Cloud Managed Inference, Nemotron, Model Context Protocol, FastAPI, Hono, TypeScript, Tailwind CSS.

## Try it
- GitHub: [link]
- Live: [vercel-url]
- Video demo: [link]
```

- [ ] **Step 2: Commit**

```bash
git add docs/DEVPOST.md
git commit -m "docs: Devpost submission draft"
```

---

## Task 7.4: Record 90-second demo video

- [ ] **Step 1: Prepare the demo state**

- Open `http://localhost:3000` in a clean browser window. Zoom to ~90%.
- Open a terminal next to the browser visible to the recording.
- Have `./scripts/demo-worker-oom.sh` and `./scripts/chaos-rehearsal.sh` ready.
- Boot all three services.

- [ ] **Step 2: Record the 90-second arc**

Follow the script in `docs/specs/2026-05-21-argus-design.md` §10. Time the cuts:
- 0-10s: title card.
- 10-25s: trigger incident; show split-screen lighting up.
- 25-50s: triangulation across tools; agreement meter.
- 50-65s: click "Kill Claude" → banner → reasoning continues on Nemotron.
- 65-80s: click "Sever Gateway" → banner → investigation finishes.
- 80-90s: pitch slide with TrueFoundry + Crusoe logos + tagline.

Use OBS / QuickTime screen-record + voiceover.

- [ ] **Step 3: Save as `docs/demo.mp4` (or upload + link)**

If file is too large for the repo, upload to YouTube/Loom unlisted and put the link in `docs/DEVPOST.md`.

- [ ] **Step 4: Commit reference**

```bash
git add docs
git commit -m "docs: demo video" --allow-empty
```

---

# Phase 8 — Submit (Day 7→8, Wed 2026-05-28 by 10:00 AM PST)

## Task 8.1: Final submission checklist

- [ ] **Step 1: Verify all MVP boxes from spec §9.1**

  - 1 chaos scenario end-to-end working (`worker-oom`) ✓
  - 4 MCP tools (logs / metrics / traces / runbook) with circuit breakers ✓
  - 4 mock services + chaos hooks ✓
  - Split-screen UI + chaos panel + agreement meter ✓
  - Provider failover Claude ↔ Nemotron via TrueFoundry Gateway ✓
  - Final markdown report ✓
  - 90-second demo video ✓

- [ ] **Step 2: Push to GitHub**

```bash
gh repo create argus --public --source=. --remote=origin --push
```

- [ ] **Step 3: Deploy web app to Vercel**

```bash
pnpm --filter @argus/web exec vercel --prod
```

Set `NEXT_PUBLIC_ORCH_URL` env var on the deployment to point at a publicly accessible orchestrator (for demo purposes; the in-person/online judges will see the recorded video — live link is bonus).

- [ ] **Step 4: Devpost submission**

Go to https://devnetwork-ai-ml-hack-2026.devpost.com/ → "Enter a Submission":
- Project name: **Argus**
- Elevator pitch: from `docs/DEVPOST.md`
- The whole story: from `docs/DEVPOST.md`
- Built with: from `docs/DEVPOST.md`
- Image gallery: 4 screenshots (split-screen, agreement meter close-up, failover banner, final report).
- Try it: GitHub URL + Vercel URL.
- Video demo: link.
- Submit to challenges: **TrueFoundry — Resilient Agents** and **Crusoe — Nemotron Agent**.
- Accept T&Cs → Submit to Hackathon.

- [ ] **Step 5: Email sponsors**

- TrueFoundry: brief note to (none listed) with the link.
- Crusoe: eacheampong@crusoe.ai — "Submitted Argus to your Nemotron challenge. Built on Crusoe Managed Inference; demo at <link>."

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "submit: argus hackathon submission complete" --allow-empty
git push
```

---

# Stretch goals (do only if MVP is done early)

These are NOT required. List for reference if the schedule slips ahead of plan.

- **S1.** Observability-style `/observability` page rendering live metrics charts.
- **S2.** Approval-gated remediation mode: agent proposes a restart, UI shows an "Approve" button, on click orchestrator calls `POST /chaos/clear` on the affected service.
- **S3.** Mid-step failover (kill primary during an in-flight tool call).
- **S4.** SQLite append-only step log + replay UI.
- **S5.** Real Sentry MCP integration replacing mock logs.

---

# Notes for the executor

- **Run tests before each commit.** Each task ends with a commit step; that commit assumes the relevant tests pass.
- **Frequent commits.** One commit per task at minimum. If a task is large, sub-commit.
- **If a real API call fails in Phase 2 smoke** (Crusoe Nemotron access, TrueFoundry Gateway access): stop and fix env vars / model names / endpoint paths before continuing — Phases 3+ depend on this.
- **If short on time** at any point: cut to MVP scope (spec §9.1). Stretches and second scenario can be dropped.
- **The demo video is the deliverable.** A working live app is bonus. Lock the video Tuesday EOD.
