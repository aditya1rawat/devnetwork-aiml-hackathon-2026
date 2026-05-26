import "dotenv/config";
import { serve } from "@hono/node-server";
import { buildApp } from "./server.js";
import { GatewayClient } from "./gateway.js";
import { McpPool } from "./mcp-pool.js";
import { StdioMcpClients } from "./mcp-stdio.js";
import { HttpMcpClient } from "./mcp-http.js";
import { IncidentKbClient } from "./incident-kb-client.js";
import { ProviderRegistry } from "./providers.js";
import { loadAllIncidents } from "./incident-store.js";

const PORT = Number(process.env.PORT ?? 7200);

const nemotronViaTfy = process.env.NEMOTRON_VIA_TFY === "1";
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
  providerMode: nemotronViaTfy ? {} : { nemotron: "direct" },
});

if (!process.env.TRUEFOUNDRY_API_KEY) {
  console.warn("[argus] no TRUEFOUNDRY_API_KEY; booting in direct mode");
  gateway.setMode("direct");
}

const mcpClients = new StdioMcpClients();
await mcpClients.connectAll();

const kbMcpUrl = process.env.INCIDENT_KB_MCP_URL ?? "http://localhost:7300/mcp";
const kbClient = new HttpMcpClient(kbMcpUrl, "argus-orchestrator-incident-kb");
try {
  await kbClient.connect();
  console.log(`[argus] incident-kb mcp connected at ${kbMcpUrl}`);
} catch (err) {
  console.warn(`[argus] incident-kb mcp not reachable at ${kbMcpUrl}: ${(err as Error).message}`);
}

const kbAdmin = process.env.INCIDENT_KB_ADMIN_URL
  ? new IncidentKbClient(process.env.INCIDENT_KB_ADMIN_URL)
  : null;

const pool = new McpPool({
  tools: {
    search_logs: "logs",
    query_metrics: "metrics",
    query_traces: "traces",
    read_runbook: "runbook",
    read_incident_kb: "incident_kb",
  },
  call: async (server, tool, args) => {
    if (server === "incident_kb") return kbClient.call(tool, args);
    return mcpClients.call(server, tool, args);
  },
});

const registry = new ProviderRegistry(["claude", "nemotron"], { quarantineMs: 60_000 });
const chaosState = { killClaude: false, killNemotron: false, gatewayDown: false };

const preloaded = await loadAllIncidents();
if (preloaded.length > 0) console.log(`[argus] rehydrated ${preloaded.length} incident(s) from disk`);
const { app } = buildApp({ gateway, pool, registry, chaosState, kb: kbAdmin, preloaded });

serve({ fetch: app.fetch, port: PORT }, ({ port }) => {
  console.log(`[argus] orchestrator on :${port}`);
});

process.on("SIGINT", async () => {
  await mcpClients.closeAll();
  await kbClient.close();
  process.exit(0);
});
