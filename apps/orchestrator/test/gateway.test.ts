import { describe, it, expect, vi, beforeEach } from "vitest";
import { GatewayClient, GatewayError } from "../src/gateway.js";

describe("GatewayClient", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("calls TrueFoundry Gateway by default", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: "hi" } }] }), { status: 200 }),
    );
    const gw = new GatewayClient({
      gatewayUrl: "https://gw/v1",
      gatewayKey: "k",
      directKeys: { claude: "ak", nemotron: "ck" },
      directUrls: { claude: "https://anth/v1", nemotron: "https://crusoe/v1" },
      fetch: fetchMock as unknown as typeof fetch,
    });
    const res = await gw.chat({ provider: "claude", model: "claude-x", messages: [], temperature: 0 });
    expect(res.text).toBe("hi");
    expect(fetchMock.mock.calls[0]![0]).toBe("https://gw/v1/chat/completions");
  });

  it("throws GatewayError on 503", async () => {
    const fetchMock = vi.fn(async () => new Response("nope", { status: 503 }));
    const gw = new GatewayClient({
      gatewayUrl: "https://gw/v1",
      gatewayKey: "k",
      directKeys: { claude: "ak", nemotron: "ck" },
      directUrls: { claude: "https://anth/v1", nemotron: "https://crusoe/v1" },
      fetch: fetchMock as unknown as typeof fetch,
    });
    await expect(gw.chat({ provider: "claude", model: "claude-x", messages: [], temperature: 0 }))
      .rejects.toBeInstanceOf(GatewayError);
  });

  it("falls back to direct provider when gateway disabled", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: "hi-direct" } }] }), { status: 200 }),
    );
    const gw = new GatewayClient({
      gatewayUrl: "https://gw/v1",
      gatewayKey: "k",
      directKeys: { claude: "ak", nemotron: "ck" },
      directUrls: { claude: "https://anth/v1", nemotron: "https://crusoe/v1" },
      fetch: fetchMock as unknown as typeof fetch,
    });
    gw.setMode("direct");
    const res = await gw.chat({ provider: "claude", model: "claude-x", messages: [], temperature: 0 });
    expect(res.text).toBe("hi-direct");
    expect(fetchMock.mock.calls[0]![0]).toBe("https://anth/v1/chat/completions");
  });

  it("blocked provider throws GatewayError", async () => {
    const gw = new GatewayClient({
      gatewayUrl: "https://gw/v1",
      gatewayKey: "k",
      directKeys: { claude: "ak", nemotron: "ck" },
      directUrls: { claude: "https://anth/v1", nemotron: "https://crusoe/v1" },
      fetch: vi.fn() as unknown as typeof fetch,
    });
    gw.setProviderBlocked("claude", true);
    await expect(gw.chat({ provider: "claude", model: "claude-x", messages: [], temperature: 0 }))
      .rejects.toBeInstanceOf(GatewayError);
  });
});
