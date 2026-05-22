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
