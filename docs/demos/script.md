"Every team building agents hits the same wall in production: the model blinks, and the agent dies. The standard answer is a retry loop — start over, lose all your reasoning. We asked a different question. HA web servers run on N machines. Why don't agents? This is Argus — a dual-cognition SRE agent that investigates incidents, survives the chaos it's responding to, and learns from every case it closes."

"This is Ridgeline, a data-pipeline platform. It's the product your on-call engineer actually lives in."

"Let's check out our service's connections. It seems our postgres databases are suffering from elevated timeouts and latency issues"

"Argus detected the fault from inside the product. No dashboard to go hunt, no alert to triage — it's right here."

"And before I do anything, it's already streaming an AI-generated first-pass diagnosis"

"And with one click, we can initiate the autonomous investigation."

"Argus now warms up, and will start pulling logs, metrics, traces, and runbooks through MCP servers, all while building a timeline of tool calls as it reasons."

"And here's the part that matters. Argus isn't running one model — it's running two, in lockstep. Claude is the primary; Nemotron, on Crusoe, is a shadow agent executing the same investigation."

"And any disagreements between the models expose hallucination. This redundancy gives us a built-in confidence check for free."

"Now let's see what happens when I kill the primary mid-thought."

"As we can see: No retry loop. No cold start. The shadow was already mid-investigation, so it just takes over with zero context loss."

"And if the gateway itself fails, Argus falls back to calling providers directly. It routes around its own dependencies while it's working."

"Now that our surviving agent has solved the investigation, it generates a final report that includes a summary and rough timeline of the incident, followed by the root cause, evidence and justification, concluded with suggested remediation."

"At the bottom, watch the counter — that's the live ingestion of our investigation into the knowledge base. Once it completes ingestion, we can see this graph with our current incident shown below alongside archived incidents that share similar relationships. Just below that we have previous incidents that were consulted during the investigation."

"Now lets look at what's under the hood: a Neo4j database, built with Graphiti. It's a real bi-temporal graph: incidents, services, root causes, and remediations as typed nodes, linked by typed relationships, every edge stamped with when it was valid. That panel on the left is the live schema — 58 nodes; 118 relationship edges; and several property keys. This isn't a vector blob — it's queryable structure that compounds with every incident Argus closes"

"Now let's check out more of the Argus platform. Here's the dashboard with six scenarios across four services, each with its own Ridgeline product surface. A bad config deploy. Upstream database timeouts. A sign-in 503 storm. Same pattern every time — the fault surfaces inside the product, and Argus is one click from a full investigation. Inspection will take you to the triggered error immediately and you can follow the same flow I just demo'd."

"We can also browse our past incidents and their reports. Here we can see a past investigation and the investigation we just ran. These historical cases are meant to represent cases that a team may have already completed before integrating Argus into their services. They are still ingested to our knowledge base so your team can continue to benefit from lessons learned in past incidents, even if they occurred before adopting Argus."

"So that's Argus. Dual cognition so the agent survives its own failures. A knowledge graph so it gets smarter with every incident. And product-embedded triggers so the operator never leaves the screen they're already staring at. Redundancy for agents isn't overhead — it's a necessity for reliability. Thank you."