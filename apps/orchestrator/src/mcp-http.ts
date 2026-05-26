import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export class HttpMcpClient {
  private client: Client | null = null;

  constructor(private url: string, private name: string) {}

  async connect(): Promise<void> {
    const transport = new StreamableHTTPClientTransport(new URL(this.url));
    this.client = new Client({ name: this.name, version: "0.1.0" }, { capabilities: {} });
    await this.client.connect(transport);
  }

  async call(tool: string, args: Record<string, unknown>): Promise<unknown> {
    if (!this.client) throw new Error(`http mcp client not connected: ${this.name}`);
    const res = await this.client.callTool({ name: tool, arguments: args });
    // Prefer the parsed dict (structuredContent) so callers get typed data;
    // fall back to the text content blocks for tools that return plain text.
    return (res as { structuredContent?: unknown }).structuredContent ?? res.content;
  }

  async close(): Promise<void> {
    if (this.client) {
      try { await this.client.close(); } catch {}
      this.client = null;
    }
  }
}
