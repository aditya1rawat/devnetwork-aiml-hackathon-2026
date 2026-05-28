# DigitalOcean + Vercel deployment plan

Status snapshot (2026-05-28): **DEPLOYED.** Both Vercel apps live at https://argus-sre.vercel.app and https://ridgeline-data.vercel.app; Droplet stack (orch + KB + cluster + Neo4j + Caddy) running at https://orch.64-23-239-2.sslip.io. End-to-end flow verified: trigger fault on Ridgeline → triage streams → click through to Argus → live SSE investigation → KB ingest counter → case-graph renders. KB pre-seeded with 14 historical incidents via local-to-Droplet `neo4j-admin dump` migration.

## Decisions locked

| Decision | Choice | Why |
|---|---|---|
| Frontends | **Vercel** (`apps/web`, `apps/ridgeline`) | Already partly committed. Free hobby tier covers both; edge + preview deploys. |
| Backend host | **DigitalOcean Droplet** + docker-compose | User has DO credits; SSE works (no spin-down); identical mental model to local dev; volumes for orch + Neo4j persistence. |
| Neo4j | **Self-hosted** on same Droplet | Already containerized locally; zero config change; always-on (no Aura auto-pause). |
| Edge protocol | **Subdomain + Caddy + Let's Encrypt** | Vercel forces HTTPS → mixed-content blocks `http://<ip>`. Required, not optional. |
| Build flow | **Source build on Droplet** (`git pull` + `docker compose build`) | No registry to manage; KB image is the slow one (one-time pay); layer cache handles iteration. |

## Architecture (deployed)

```
[Operator browser]
    │ HTTPS
    ▼
[Vercel: argus.<domain>]  [Vercel: ridgeline.<domain>]
    │ HTTPS (CORS allowlisted)
    ▼
[orch.<domain>] ── Caddy (TLS termination, Let's Encrypt)
    │
    ▼ HTTP (internal docker network)
[DO Droplet — docker-compose]
   ├── orchestrator (port 7200)
   │     spawns MCP children (logs/metrics/traces/runbook) via stdio
   ├── cluster (ports 7100-7104 internal)
   ├── kb (7300 MCP + 7301 admin)
   ├── neo4j (7474 / 7687 internal, volume-backed)
   └── caddy (80/443 public)
```

## Done so far

| Step | Description | Verified by |
|---|---|---|
| 1 | Added `hono/cors` middleware with env-driven `CORS_ORIGINS` allowlist; removed legacy wildcard CORS block that defeated lockdown. | curl preflight/simple/allowed-vs-disallowed origin checks. Commits `8e911aa`, `e73e23e`. |
| 2 | Verified `MOCK_CLUSTER_URL`, `INCIDENT_KB_MCP_URL`, `INCIDENT_KB_ADMIN_URL` already env-driven. Cluster's internal 127.0.0.1 hops are fine because all 5 procs share localhost inside the container. Added `CORS_ORIGINS` to `.env.example`. | Existing local runtime + env grep. |
| 3 | Confirmed `services/mock-cluster/src/argus_cluster/orchestrator.py` already launches all 5 uvicorns via `multiprocessing`; `cluster` script entry point exists for Docker CMD. | Read pyproject + source. |
| 4a | `services/mock-cluster/Dockerfile` (python:3.13-slim + uv pip install). | `docker build` clean; container runs, all 5 ports respond `200 /health`. |
| 4b | `services/incident-kb/Dockerfile` (python:3.13-slim + `uv sync --frozen` + sentence-transformer prefetch). Also fixed `main.py` to tolerate missing `.env.local` in containers via `try/except IndexError` on `Path.parents[4]`. | `docker build` clean (5.66 GB); container starts in ~13 s against host Neo4j; `/health`, `/admin/ingest/status/{id}`, `/incidents` all 200. |
| 4c | `apps/orchestrator/Dockerfile` (node:22-slim + corepack pnpm + workspace install). Added `start:prod` npm script to orch `package.json` (drops `--env-file=../../.env.local`). Working dir stays at workspace root so `pnpm --filter @argus/mcp ...` resolves for stdio MCP children. | `docker build` clean; container starts in ~5 s against host KB + cluster; `/health`, `/state`, MCP-connected log line all green. |
| extras | `.dockerignore` at repo root excludes `node_modules`, `.next`, build artifacts, local `data/incidents`, `.env*`, `.git`, editor caches. | Keeps images clean and prevents secrets from baking in. |

## Remaining steps

### Step 5 — `docker-compose.prod.yml`

Wire the four services + Neo4j into one stack on a shared network with named volumes. Verify gate: full `docker compose up -d` on local Mac brings everything up healthy; trigger a `/jobs` worker-oom scenario end-to-end and confirm investigation resolves + KB ingest counter ticks + case-graph populates.

Sketch:

```yaml
services:
  neo4j:
    image: neo4j:5
    environment:
      NEO4J_AUTH: neo4j/${NEO4J_PASSWORD}
    volumes: [neo4j-data:/data]
  cluster:
    build: ./services/mock-cluster
    expose: ["7100"]
  kb:
    build: ./services/incident-kb
    env_file: .env.prod
    environment:
      NEO4J_URI: bolt://neo4j:7687
    depends_on: [neo4j]
  orch:
    build:
      context: .
      dockerfile: apps/orchestrator/Dockerfile
    env_file: .env.prod
    environment:
      MOCK_CLUSTER_URL: http://cluster:7100
      INCIDENT_KB_MCP_URL: http://kb:7300/mcp
      INCIDENT_KB_ADMIN_URL: http://kb:7301
    volumes: [orch-data:/app/apps/orchestrator/data]
    depends_on: [kb, cluster]
  caddy:
    image: caddy:2
    ports: ["80:80", "443:443"]
    volumes:
      - ./deploy/Caddyfile:/etc/caddy/Caddyfile
      - caddy-data:/data
      - caddy-config:/config
    depends_on: [orch]
volumes:
  neo4j-data: {}
  orch-data: {}
  caddy-data: {}
  caddy-config: {}
```

### Step 6 — Provision Droplet

- Ubuntu 24.04, minimum **2 GB RAM** (KB needs ~1 GB for sentence-transformers + Graphiti).
- Recommend `s-2vcpu-2gb` ($12/mo from credits) — 1 GB tier OOMs under the embedding model.
- Region: closest to the demo audience (NYC3 or SFO3).
- Add SSH key during creation.
- Reserve a floating IP.

Verify: `ssh root@<ip>` works; `apt update && apt -y upgrade` completes.

### Step 7 — Install Docker, clone repo, set secrets

```bash
ssh root@<ip>
apt install -y docker.io docker-compose-plugin git
git clone https://github.com/<user>/devnetwork-hackathon-2026.git
cd devnetwork-hackathon-2026
cp .env.example .env.prod
# edit .env.prod: real TFY/Anthropic/Crusoe keys, NEO4J_PASSWORD, CORS_ORIGINS
```

`.env.prod` keys to set:
- `TRUEFOUNDRY_API_KEY`, `ANTHROPIC_API_KEY`, `CRUSOE_API_KEY`
- `NEO4J_PASSWORD` (regenerate; don't reuse `devpass`)
- `CORS_ORIGINS=https://argus.<domain>,https://ridgeline.<domain>`
- `GRAPHITI_LLM_PROVIDER=crusoe`, `CRUSOE_MODEL=nvidia/Nemotron-3-Nano-Omni-Reasoning-30B-A3B`
- `EXTRACTION_RPM_LIMIT=120`, `SEMAPHORE_LIMIT=2`

Verify: `cat .env.prod | grep -v '^#' | grep '='` shows all required keys set.

### Step 8 — DNS + Caddyfile

Three A records pointing at the Droplet's floating IP:
- `argus.<domain>` → Vercel CNAME (set up later in step 9)
- `ridgeline.<domain>` → Vercel CNAME
- `orch.<domain>` → Droplet IP (this is what Caddy serves)

`deploy/Caddyfile`:

```
orch.<domain> {
  reverse_proxy orch:7200
}
```

Caddy auto-provisions the Let's Encrypt cert on first request.

Verify: `dig orch.<domain>` returns Droplet IP; `curl https://orch.<domain>/health` returns `{"ok":true}` with a valid TLS cert.

### Step 9 — Bring up the stack

```bash
docker compose --env-file .env.prod up -d --build
docker compose ps                       # expect 5 services Up
docker compose logs -f orch | head -50  # MCP connected, no errors
```

Smoke from outside:
```bash
curl https://orch.<domain>/health
curl https://orch.<domain>/scenarios
curl -i -X OPTIONS \
  -H 'Origin: https://argus.<domain>' \
  -H 'Access-Control-Request-Method: POST' \
  https://orch.<domain>/triage          # expect 204 + ACAO header
```

### Step 10 — Vercel deploy (web + ridgeline)

For each app:
1. `vercel link` to project.
2. Set env vars in Vercel dashboard:
   - `NEXT_PUBLIC_ORCH_URL=https://orch.<domain>`
3. `vercel --prod`.
4. Add `argus.<domain>` (web) and `ridgeline.<domain>` (ridgeline) as custom domains; Vercel issues the CNAME instructions.

Verify: visit `https://argus.<domain>/dashboard`, fire `inspect` on a scenario, full investigation streams over SSE to the Droplet, case-graph counter ticks, graph appears, no console CORS errors.

### Step 11 — End-to-end demo dry-run

Trigger one resolved scenario from Ridgeline, one chaos-kill from Argus, one halted (failed) incident. Confirm:
- 1.2 s alert beat works
- `↻` refresh button works on case-graph
- Kill-claude aborts mid-step (no extra primary step)
- Chaos auto-restores on `incident_done`
- KB ingest counter ticks (extractions + elapsed)
- Failed incident shows "not saved to knowledge base"

## Known issues / things to validate before demo day

- **KB image is 5.66 GB.** Driven by sentence-transformers pulling the default torch wheel (CUDA-flagged). Acceptable for now; trim by adding `torch --index-url https://download.pytorch.org/whl/cpu` if disk becomes tight.
- **Orchestrator persistent state in `apps/orchestrator/data/incidents/`** must be a docker volume so restarts don't drop rehydrated incidents. Already wired in the compose sketch.
- **TLS cert provisioning** can fail if DNS hasn't propagated; first Caddy boot may need a manual `caddy reload` after DNS settles.
- **Neo4j initial seed**: after first Droplet bring-up, KB starts empty. Re-seed with `pnpm seed-kb` pointing at `https://orch.<domain>` (or run the seed script from inside the orch container).
- **Mock cluster is demo-only**. It exposes chaos endpoints under `/chaos/*`. For a real production system this would be replaced with real observability MCP servers, but for the hackathon it's the demo's source of truth.
- **No auth on orch.** CORS allowlist is the only access control. Anyone who knows the domain can `POST /chaos/*` and `POST /scenarios/:id/start`. Acceptable for a demo URL; not for production.

## Gotchas hit during deploy (write-up for future runs)

- **pnpm version drift.** Vercel's builder defaults to pnpm 10 by project creation date and ignores the `packageManager: pnpm@9.x` pin. Setting `ENABLE_EXPERIMENTAL_COREPACK=1` was acknowledged in the build log but didn't actually switch the runtime. Resolution: bump `packageManager` to `pnpm@10.0.0`; lockfile was format-compatible.
- **Monorepo upload scoping.** With Root Directory set to `apps/web`, Vercel only uploads that subtree by default — the workspace-root `pnpm-lock.yaml` and `pnpm-workspace.yaml` never ship. Enable **Settings → General → Include source files outside of the Root Directory in the Build Step** and the install + build commands can `cd ../..`.
- **Per-app `.vercel/` linking.** Local `vercel link` inside `apps/ridgeline` puts `.vercel/project.json` there, and the CLI then double-appends the server-side Root Directory (`apps/ridgeline/apps/ridgeline`). Cleanest path: use **GitHub-integrated auto-deploys** for both projects; `git push origin main` triggers both builds and there's no `.vercel/` swap dance.
- **Path of least resistance with TLS.** sslip.io's wildcard DNS lets Caddy auto-provision Let's Encrypt for `<subdomain>.<dashed-ip>.sslip.io` without owning a domain. The Caddyfile just names the host; first request triggers ACME challenge.
- **Neo4j 5 password length.** Default `devpass` (7 chars) is rejected by Neo4j 5; need ≥8. Use `devpass12` for local convenience or generate a real password in prod.
- **Docker compose `${VAR}` interpolation.** Values containing `$` (e.g. Crusoe API keys) need `$$` escapes inside the env file used as `--env-file`, otherwise compose tries to interpolate them and you get a "variable not set" warning + a corrupted env value.
- **Neo4j APOC plugin.** `case_graph.py` uses `apoc.path.subgraphAll()`. The `neo4j:5` image ships the APOC jar in `/var/lib/neo4j/labs/` but doesn't auto-load it. Set `NEO4J_PLUGINS=["apoc"]` + `NEO4J_dbms_security_procedures_unrestricted=apoc.*`.
- **KB driver pool after Neo4j restart.** Recreating Neo4j leaves the KB container holding bolt connections to the dead instance ("OSError: No data"). Always `docker compose restart kb` after recreating neo4j.
- **Orch healthcheck image dependencies.** `node:22-slim` has no `wget`/`curl`; use `node -e "fetch(...)"` for the healthcheck. Same for KB which is `python:3.13-slim` — use `python -c "urllib.request.urlopen(...)"`.
- **CORS allowlist needs every Vercel hostname.** Triage works from `argus-sre.vercel.app` doesn't mean it works from `ridgeline-data.vercel.app`. List both in `CORS_ORIGINS`.
- **Vercel's `.vercel.app` is taken.** Both `argus.vercel.app` and `ridgeline.vercel.app` were claimed. Final names: `argus-sre.vercel.app`, `ridgeline-data.vercel.app`.
- **`NEXT_PUBLIC_*` is build-time.** Setting env vars in Vercel doesn't update a live build — must redeploy after each new var.
- **Swap on a 2GB Droplet.** Docker builds (especially KB with torch + sentence-transformers) OOM on 2 GB without swap. Add 2 GB via `fallocate -l 2G /swapfile && swapon /swapfile && echo '/swapfile none swap sw 0 0' >> /etc/fstab`.

## Future hardening (not in scope for hackathon)

- Replace mock cluster with real observability MCP servers (Sentry, Datadog).
- Approval-gated remediation (orch proposes, operator clicks confirm).
- Predictive brownout detection from latency telemetry.
- API token auth on chaos endpoints.
- Migrate Neo4j to Aura if the demo scales.
