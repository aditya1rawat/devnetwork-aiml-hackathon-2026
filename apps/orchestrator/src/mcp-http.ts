import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export class HttpMcpClient {
  private client: Client | null = null;

  constructor(private url: string, private name: string) {}

  async connect(): Promise<void> {
    const transport = new StreamableHTTPClientTransport(new URL(this.url));
    const client = new Client({ name: this.name, version: "0.1.0" }, { capabilities: {} });
    await client.connect(transport);
    this.client = client;
  }

  async call(tool: string, args: Record<string, unknown>): Promise<unknown> {
    try {
      return await this.invoke(tool, args);
    } catch (err) {
      // The KB service may have restarted, leaving this connection stale.
      // Reconnect once and retry before surfacing the error.
      try { await this.connect(); } catch { throw err; }
      return this.invoke(tool, args);
    }
  }

  private async invoke(tool: string, args: Record<string, unknown>): Promise<unknown> {
    if (!this.client) await this.connect();
    const res = await this.client!.callTool({ name: tool, arguments: args });
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
