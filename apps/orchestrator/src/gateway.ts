import type { ProviderName } from "./types.js";

export class GatewayError extends Error {
  constructor(message: string, public status: number, public provider: ProviderName) {
    super(message);
  }
}

export type GatewayMode = "gateway" | "direct";

export interface ChatRequest {
  provider: ProviderName;
  model: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  temperature: number;
  maxTokens?: number;
  responseFormat?: "json_object" | "text";
}

export interface ChatResponse {
  text: string;
  latencyMs: number;
  provider: ProviderName;
  via: GatewayMode;
}

export interface GatewayClientOpts {
  gatewayUrl: string;
  gatewayKey: string;
  directKeys: Record<ProviderName, string>;
  directUrls: Record<ProviderName, string>;
  providerMode?: Partial<Record<ProviderName, GatewayMode>>;
  fetch?: typeof fetch;
}

export class GatewayClient {
  private mode: GatewayMode = "gateway";
  private fetch: typeof fetch;
  private blockedProviders = new Set<ProviderName>();
  private gatewayFailures = 0;
  // In-flight chat requests per provider. Tracked so that when chaos kills a
  // provider, we abort any current call immediately instead of letting the
  // step finish — otherwise the demo "kill claude" shows one extra primary
  // step before failover kicks in.
  private inflight = new Map<ProviderName, Set<AbortController>>();

  constructor(private opts: GatewayClientOpts) {
    this.fetch = opts.fetch ?? globalThis.fetch;
  }

  setMode(mode: GatewayMode): void {
    this.mode = mode;
  }

  getMode(): GatewayMode {
    return this.mode;
  }

  setProviderBlocked(provider: ProviderName, blocked: boolean): void {
    if (blocked) {
      this.blockedProviders.add(provider);
      const set = this.inflight.get(provider);
      if (set) for (const ctrl of set) ctrl.abort();
    } else {
      this.blockedProviders.delete(provider);
    }
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    if (this.blockedProviders.has(req.provider)) {
      throw new GatewayError("provider killed by chaos", 503, req.provider);
    }
    const { url, headers } = this.endpoint(req.provider);
    const body = {
      model: req.model,
      messages: req.messages,
      temperature: req.temperature,
      ...(req.maxTokens ? { max_tokens: req.maxTokens } : {}),
      ...(req.responseFormat === "json_object"
        ? { response_format: { type: "json_object" } }
        : {}),
    };
    const t0 = Date.now();
    const ctrl = new AbortController();
    let set = this.inflight.get(req.provider);
    if (!set) {
      set = new Set();
      this.inflight.set(req.provider, set);
    }
    set.add(ctrl);
    let res: Response;
    try {
      res = await this.fetch(`${url}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
    } catch (err) {
      const msg = (err as Error).message;
      const aborted = ctrl.signal.aborted || /aborted|abort/i.test(msg);
      throw new GatewayError(
        aborted ? "provider killed by chaos" : `network: ${msg}`,
        aborted ? 503 : 0,
        req.provider,
      );
    } finally {
      set.delete(ctrl);
    }
    const via = this.effectiveMode(req.provider);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      if (via === "gateway") {
        this.gatewayFailures += 1;
        if (this.gatewayFailures >= 3 && this.opts.directKeys[req.provider]) {
          this.mode = "direct";
          this.gatewayFailures = 0;
        }
      }
      throw new GatewayError(`status ${res.status}: ${text.slice(0, 200)}`, res.status, req.provider);
    }
    const json = (await res.json()) as {
      choices: Array<{ message: { content: string | null; reasoning?: string | null } }>;
    };
    const msg = json.choices[0]?.message;
    const text = (msg?.content ?? msg?.reasoning ?? "").trim();
    this.gatewayFailures = 0;
    return { text, latencyMs: Date.now() - t0, provider: req.provider, via };
  }

  private effectiveMode(provider: ProviderName): GatewayMode {
    return this.opts.providerMode?.[provider] ?? this.mode;
  }

  private endpoint(provider: ProviderName): { url: string; headers: Record<string, string> } {
    if (this.effectiveMode(provider) === "gateway") {
      return {
        url: this.opts.gatewayUrl,
        headers: { authorization: `Bearer ${this.opts.gatewayKey}` },
      };
    }
    const url = (this.opts.directUrls[provider] ?? "").replace(/\/$/, "");
    return {
      url,
      headers: { authorization: `Bearer ${this.opts.directKeys[provider]}` },
    };
  }
}
