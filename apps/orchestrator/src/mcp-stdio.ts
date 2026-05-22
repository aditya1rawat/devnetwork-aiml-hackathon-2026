import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const SERVERS: Record<string, { cmd: string; args: string[] }> = {
  logs:     { cmd: "pnpm", args: ["--filter", "@argus/mcp", "logs"] },
  metrics:  { cmd: "pnpm", args: ["--filter", "@argus/mcp", "metrics"] },
  traces:   { cmd: "pnpm", args: ["--filter", "@argus/mcp", "traces"] },
  runbook:  { cmd: "pnpm", args: ["--filter", "@argus/mcp", "runbook"] },
};

export class StdioMcpClients {
  private clients = new Map<string, Client>();

  async connectAll(): Promise<void> {
    for (const [name, spec] of Object.entries(SERVERS)) {
      const transport = new StdioClientTransport({
        command: spec.cmd,
        args: spec.args,
      });
      const client = new Client({ name: `argus-orchestrator-${name}`, version: "0.1.0" }, { capabilities: {} });
      await client.connect(transport);
      this.clients.set(name, client);
    }
  }

  async call(server: string, tool: string, args: Record<string, unknown>): Promise<unknown> {
    const client = this.clients.get(server);
    if (!client) throw new Error(`mcp server not connected: ${server}`);
    const res = await client.callTool({ name: tool, arguments: args });
    return res.content;
  }

  async closeAll(): Promise<void> {
    for (const client of this.clients.values()) {
      try { await client.close(); } catch {}
    }
  }
}
