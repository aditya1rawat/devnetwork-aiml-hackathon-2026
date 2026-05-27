# Argus — Devpost submission

## Elevator pitch
Highly-available web servers run on N machines. Why don't agents?

## Inspiration
Every team building agents hits this pain the moment they go to production: the LLM blinks, the agent dies. Existing answers are retry loops — fundamentally single-cognition, fundamentally exposed. And when the incident is over, the knowledge dies with the chat log. No one learns.

## What it does
Argus is an autonomous on-call SRE agent that investigates live incidents while surviving the infrastructure chaos it is responding to.

**Three core capabilities:**

1. **Dual-cognition resilience.** Two LLMs — Claude (primary) and Nemotron-on-Crusoe (shadow) — execute the investigation in lockstep through TrueFoundry's AI Gateway. When the primary degrades, the shadow takes over with zero context loss. When they disagree, that disagreement is itself a hallucination signal.

2. **Incident Knowledge Base.** Every resolved investigation is ingested into a bi-temporal knowledge graph (Neo4j + Graphiti). On the next incident, Argus retrieves past cases sharing services, symptoms, or root causes — and verifies them against live signals before trusting them. The graph compounds: resolve → ingest → retrieve → resolve smarter.

3. **Ridgeline integration.** A standalone product simulation (Ridgeline — a fictional data-pipeline platform) where ordinary user actions trigger realistic faults. An embedded Argus launcher detects the fault, shows an AI-generated first-pass triage, and deep-links into the full investigation view. The operator never leaves their product context.

## How we built it
- **Next.js 16** App Router: Argus investigation view (:3000) + Ridgeline product simulation (:3001), visually and brand-distinct.
- **Node.js orchestrator** (Hono) managing dual-cognition conductor, incident lifecycle, chaos injection, KB ingest, and triage endpoints.
- **TrueFoundry AI Gateway** for provider routing + automatic direct-mode fallback when the Gateway itself fails.
- **Crusoe Cloud Managed Inference** hosts Nemotron as the shadow cognition.
- **MCP servers** wrap our (mock) observability stack: logs / metrics / traces / runbook / incident-kb. Each is wrapped with retry + circuit breaker + synthetic-response fallback.
- **Incident Knowledge Base** — Python FastAPI service backed by Neo4j + Graphiti. Ontology: incidents → services → root causes → remediations, with bi-temporal edges. MCP tool for agent retrieval, admin API for ingest/seed/reset.
- **Python FastAPI** mock service cluster (api / worker / db_proxy / auth) with chaos injection endpoints.
- **Ridgeline app** — 4 surfaces (Overview dashboard, Sign In, Query Studio, Batch Jobs), each with an embedded fault trigger and Argus launcher overlay.

## Challenges we ran into
- Shadow execution at scale: keeping two LLM streams synchronized while only executing one set of tool calls.
- Detecting "brownout" (slow but not failed) without an embedding model: ended up using token-set similarity as a pragmatic surrogate.
- Failover across mid-flight tool calls — punted; failover happens between steps in MVP.
- Knowledge graph seeding: Graphiti's entity extraction uses Gemini, which has aggressive rate limits. Built a token-bucket limiter with exponential backoff to seed 12 historical incidents without hitting quota walls.
- Two-brand visual design: Argus (cool violet, serif italic) and Ridgeline (warm green, monospace) needed to be instantly distinguishable side-by-side while both looking like real products.

## Accomplishments we're proud of
- Live demo: kill Claude mid-investigation. Nemotron carries the reasoning. Zero rebuild.
- Live demo: sever TrueFoundry Gateway. Direct-mode kicks in. Investigation completes.
- Dual cognition is a feature, not just a fallback — it's a built-in hallucination detector.
- Live demo: trigger a fault from inside a product UI. Argus detects it, triages with AI, and opens a full investigation — without the operator ever leaving context.
- The knowledge graph compounds: each resolved incident makes the next investigation smarter. No human curation required.
- Six distinct incident scenarios across four services, each with a branded product surface.

## What we learned
- Active-active is the right pattern for agents under production conditions.
- The Gateway abstraction earns its complexity the moment chaos hits.
- A knowledge base that ingests its own outputs creates a genuine learning loop — the agent's historical memory is its strongest reasoning aid.
- Product-embedded AI triggers (not dashboards, not chatbots) are the right UX for on-call operators. They're already staring at the broken thing.

## What's next
- Real observability plug (Sentry/Datadog MCP) — chaos hooks become unnecessary.
- Approval-gated remediation mode → autonomous remediation.
- Predictive brownout detection from latency telemetry.
- Graph-powered anomaly correlation: when a new incident shares a service node with 3+ past incidents, surface the pattern proactively.

## Built with
Next.js 16, React 19, Hono, TrueFoundry AI Gateway, Crusoe Cloud Managed Inference, Nemotron, Claude, Model Context Protocol, Neo4j, Graphiti, FastAPI, TypeScript, Tailwind CSS, Python.

## Try it
- GitHub: [link]
- Live: [vercel-url]
- Video demo: [link]
