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
