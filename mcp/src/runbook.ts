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
