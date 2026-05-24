import { GatewayClient } from "../src/gateway.js";

const gw = new GatewayClient({
  gatewayUrl: process.env.TRUEFOUNDRY_GATEWAY_URL ?? "",
  gatewayKey: process.env.TRUEFOUNDRY_API_KEY ?? "",
  directKeys: {
    claude: process.env.ANTHROPIC_API_KEY ?? "",
    nemotron: process.env.CRUSOE_API_KEY ?? "",
  },
  directUrls: {
    claude: "https://api.anthropic.com/v1",
    nemotron: (process.env.CRUSOE_INFERENCE_URL ?? "").replace(/\/$/, ""),
  },
});

gw.setMode("direct");

async function test(provider: "claude" | "nemotron", model: string) {
  console.log(`--- ${provider} direct (${model}) ---`);
  try {
    const res = await gw.chat({
      provider,
      model,
      messages: [{ role: "user", content: "Reply with the single word PONG." }],
      temperature: 0,
      maxTokens: 32,
    });
    console.log(`  via=${res.via} latency=${res.latencyMs}ms`);
    console.log(`  ${res.text.trim()}`);
  } catch (e) {
    console.log(`  FAIL: ${(e as Error).message}`);
  }
}

await test("nemotron", process.env.NEMOTRON_MODEL!);
