import type { LoopioConfig } from "../config.js";

interface TokenResponse {
  token_type: string;
  expires_in: number;
  access_token: string;
}

export interface TokenManagerOptions {
  fetchFn?: typeof fetch;
  now?: () => number;
  /** Refresh this many ms before the token actually expires. */
  refreshSkewMs?: number;
}

export class TokenManager {
  private fetchFn: typeof fetch;
  private now: () => number;
  private skew: number;
  private token: string | null = null;
  private expiresAt = 0;
  private inflight: Promise<string> | null = null;

  constructor(private cfg: LoopioConfig, opts: TokenManagerOptions = {}) {
    this.fetchFn = opts.fetchFn ?? fetch;
    this.now = opts.now ?? (() => Date.now());
    this.skew = opts.refreshSkewMs ?? 60_000;
  }

  async getToken(): Promise<string> {
    if (this.token && this.now() < this.expiresAt - this.skew) {
      return this.token;
    }
    if (this.inflight) return this.inflight;
    this.inflight = this.fetchToken().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  private async fetchToken(): Promise<string> {
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      scope: this.cfg.scopes.join(" "),
      client_id: this.cfg.clientId,
      client_secret: this.cfg.clientSecret,
    });

    const res = await this.fetchFn(this.cfg.tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Loopio token request failed (${res.status}): ${text.slice(0, 200)}`);
    }

    const json = (await res.json()) as TokenResponse;
    this.token = json.access_token;
    this.expiresAt = this.now() + json.expires_in * 1000;
    return this.token;
  }
}
