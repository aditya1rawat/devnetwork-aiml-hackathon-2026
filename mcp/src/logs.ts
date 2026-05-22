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
