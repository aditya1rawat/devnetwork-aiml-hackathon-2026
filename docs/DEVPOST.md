# Argus — Devpost Submission

---

## a. Project Name - **Argus**

## b. Elevator Pitch

Highly-available web servers run on N machines. Why don't agents? Argus is a dual-cognition SRE agent that investigates production incidents autonomously, survives infrastructure chaos, and learns from every incident it closes.

## c. Created By - Aditya Rawat

## d. Here's the Whole Story

### Inspiration

Every team building agents hits this pain the moment they go to production: the LLM blinks, the agent dies. Existing answers are retry loops, fundamentally single-cognition and fundamentally exposed. And when the incident is over, the knowledge dies with the chat log. No one learns.

### What it does

Argus is an autonomous on-call SRE agent that investigates live incidents while surviving the infrastructure chaos it is responding to.

**Three core capabilities:**

1. **Dual-cognition resilience.** Two LLMs (Claude as the primary, Nemotron-on-Crusoe as the shadow) execute the investigation in lockstep through TrueFoundry's AI Gateway. When the primary degrades, the shadow takes over with zero context loss. When they disagree, that disagreement is itself a hallucination signal.

2. **Incident Knowledge Base.** Every resolved investigation is ingested into a bi-temporal knowledge graph (Neo4j + Graphiti). On the next incident, Argus retrieves past cases sharing services, symptoms, or root causes, then verifies them against live signals before trusting them. The graph compounds: resolve, ingest, retrieve, resolve smarter.

3. **Ridgeline integration.** A standalone product simulation (Ridgeline, a fictional data-pipeline platform) where ordinary user actions trigger realistic faults. An embedded Argus launcher detects the fault, shows an AI-generated first-pass triage, and deep-links into the full investigation view. The operator never leaves their product context.

### How we built it

- **Next.js 16** App Router: Argus investigation view (:3000) + Ridgeline product simulation (:3001), visually and brand-distinct.
- **Node.js orchestrator** (Hono) managing dual-cognition conductor, incident lifecycle, chaos injection, KB ingest, and triage endpoints.
- **TrueFoundry AI Gateway** for provider routing + automatic direct-mode fallback when the Gateway itself fails.
- **Crusoe Cloud Managed Inference** hosts Nemotron as the shadow cognition.
- **MCP servers** wrap our (mock) observability stack: logs / metrics / traces / runbook / incident-kb. Each is wrapped with retry + circuit breaker + synthetic-response fallback.
- **Incident Knowledge Base** built on Python FastAPI, backed by Neo4j + Graphiti. Ontology: incidents → services → root causes → remediations, with bi-temporal edges. MCP tool for agent retrieval, admin API for ingest/seed/reset.
- **Python FastAPI** mock service cluster (api / worker / db_proxy / auth) with chaos injection endpoints.
- **Ridgeline app** with 4 surfaces (Overview dashboard, Sign In, Query Studio, Batch Jobs), each with an embedded fault trigger and Argus launcher overlay.

### Challenges we ran into

- Shadow execution at scale: keeping two LLM streams synchronized while only executing one set of tool calls.
- Detecting "brownout" (slow but not failed) without an embedding model. We ended up using token-set similarity as a pragmatic surrogate.
- Failover across mid-flight tool calls. We punted on this; failover happens between steps in the MVP.
- Knowledge graph seeding: Graphiti's entity extraction uses Gemini, which has aggressive rate limits. We built a token-bucket limiter with exponential backoff to seed 12 historical incidents without hitting quota walls.
- Two-brand visual design: Argus (cool violet, serif italic) and Ridgeline (warm green, monospace) needed to be instantly distinguishable side-by-side while both looking like real products.

### Accomplishments we're proud of

- Live demo: kill Claude mid-investigation. Nemotron carries the reasoning. Zero rebuild.
- Live demo: sever TrueFoundry Gateway. Direct-mode kicks in. Investigation completes.
- Dual cognition is a feature, not just a fallback. It's a built-in hallucination detector.
- Live demo: trigger a fault from inside a product UI. Argus detects it, triages with AI, and opens a full investigation without the operator ever leaving context.
- The knowledge graph compounds: each resolved incident makes the next investigation smarter. No human curation required.
- Six distinct incident scenarios across four services, each with a branded product surface.

### What we learned

- **Active-active beats active-passive for agents.** Running two cognitions in lockstep costs more tokens, but it pays for itself the first time the primary fails. Retry loops restart from scratch; a warm shadow picks up mid-thought. For production agents, redundancy isn't overhead, it's table stakes.

- **The Gateway abstraction earns its complexity the moment chaos hits.** When everything is healthy, a gateway looks like an unnecessary middleman. The moment you need to reroute between providers, fall back to direct API calls, or inject chaos for testing, it becomes the single control point that makes all of that possible without touching application code.

- **A knowledge base that ingests its own outputs creates a genuine learning loop.** We expected the KB to be a nice-to-have. It turned out to be the agent's strongest reasoning aid. When Argus retrieves three prior incidents with the same service and a similar symptom, it converges on the root cause faster and with higher confidence. Each resolved incident makes the next one smarter, with no human curating a knowledge base.

- **Product-embedded AI triggers are the right UX for on-call operators.** Dashboards and chatbots require a context switch. The operator is already staring at the broken thing. Embedding the trigger directly in the product surface (a failed sign-in, a saturated query, a climbing heap bar) means detection and response start from the same screen.

### What's next

- **Real observability integration.** Replace the mock service cluster with MCP servers that connect to real observability platforms (Sentry, Datadog, PagerDuty). The chaos injection endpoints become unnecessary because the real infrastructure provides the signals. This is the single biggest step toward production readiness.

- **Approval-gated remediation.** Right now Argus investigates and reports. The next step is letting it propose remediation actions (restart a pod, roll back a deploy, scale a pool) that the operator can approve with one click. The dual-cognition architecture already provides a natural approval gate: if both cognitions agree on the fix, confidence is higher.

- **Predictive brownout detection.** Instead of waiting for a fault to fire, Argus could watch latency telemetry and flag services trending toward saturation before they hit thresholds. The KB already stores historical incident timelines, so it has the training data for "this pattern usually precedes an OOM in 10 minutes."

- **Graph-powered anomaly correlation.** When a new incident shares a service node with 3+ past incidents in the knowledge graph, Argus should surface that pattern proactively. "This is the fourth worker-memory incident this quarter, all involving the same job type" is the kind of insight that turns incident response into incident prevention.

## e. Built With

Next.js 16, React 19, Hono, TrueFoundry AI Gateway, Crusoe Cloud Managed Inference, Nemotron, Claude, Model Context Protocol, Neo4j, Graphiti, FastAPI, TypeScript, Tailwind CSS, Python.

## f. Image Gallery

<!-- Add screenshots before submission:
- Ridgeline Overview dashboard (healthy state)
- Ridgeline /jobs with worker-3 OOM + Argus launcher flare
- Argus toast with AI triage diagnosis
- Argus investigation view (dual-cognition reasoning panes)
- Final report with knowledge graph neighborhood
- Ops status board (6 scenarios)
-->

## g. Try It Out

- GitHub: [link]

## h. Video Demo

<!-- Link to demo video (1-3 min) -->
