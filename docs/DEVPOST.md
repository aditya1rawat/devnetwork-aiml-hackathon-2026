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
