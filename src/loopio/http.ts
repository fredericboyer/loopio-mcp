import type { LoopioConfig } from "../config.js";
import type { Page, CappedResult } from "./types.js";

export interface TokenSource {
  getToken(): Promise<string>;
  /** Discard any cached token; the next getToken() must fetch fresh. */
  invalidate(): void;
}

export class LoopioError extends Error {
  readonly name = "LoopioError";
  constructor(
    readonly status: number,
    readonly body: unknown,
    readonly method: string,
    readonly path: string,
  ) {
    super(`Loopio API ${method} ${path} failed (${status}): ${summarize(body)}`);
  }
}

function summarize(body: unknown): string {
  if (typeof body === "string") return body.slice(0, 300);
  try {
    return JSON.stringify(body).slice(0, 300);
  } catch {
    return String(body);
  }
}

export function buildQuery(params: Record<string, unknown>): string {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const item of value) sp.append(key, String(item));
    } else if (typeof value === "object") {
      sp.append(key, JSON.stringify(value));
    } else {
      sp.append(key, String(value));
    }
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export interface HttpClientOptions {
  fetchFn?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  maxRetries?: number;
  /** Abort each API request after this many ms. Default 30s. */
  timeoutMs?: number;
}

export interface RequestOptions {
  query?: Record<string, unknown>;
  body?: unknown;
  jsonPatch?: boolean;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const MAX_RETRY_AFTER_MS = 30_000;

export class LoopioHttpClient {
  private fetchFn: typeof fetch;
  private sleep: (ms: number) => Promise<void>;
  private maxRetries: number;
  private timeoutMs: number;

  constructor(
    private cfg: LoopioConfig,
    private tokens: TokenSource,
    opts: HttpClientOptions = {},
  ) {
    this.fetchFn = opts.fetchFn ?? fetch;
    this.sleep = opts.sleep ?? defaultSleep;
    this.maxRetries = opts.maxRetries ?? 3;
    this.timeoutMs = opts.timeoutMs ?? 30_000;
  }

  async request<T = unknown>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
    const url = this.cfg.apiBaseUrl + path + (opts.query ? buildQuery(opts.query) : "");
    let attempt = 0;
    let didAuthRetry = false;

    while (true) {
      const token = await this.tokens.getToken();
      const headers: Record<string, string> = { authorization: `Bearer ${token}` };
      let body: string | undefined;
      if (opts.body !== undefined) {
        headers["content-type"] = opts.jsonPatch
          ? "application/json-patch+json"
          : "application/json";
        body = JSON.stringify(opts.body);
      }

      const res = await this.fetchFn(url, {
        method,
        headers,
        body,
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (res.status === 401 && !didAuthRetry) {
        didAuthRetry = true;
        this.tokens.invalidate(); // drop the cached token; the next getToken() fetches fresh
        continue;
      }

      if ((res.status === 429 || res.status >= 500) && attempt < this.maxRetries) {
        attempt++;
        await this.sleep(this.backoffMs(res, attempt));
        continue;
      }

      if (!res.ok) {
        const errBody = await this.parseBody(res);
        throw new LoopioError(res.status, errBody, method, path);
      }

      if (res.status === 204) return undefined as T;
      return (await this.parseBody(res)) as T;
    }
  }

  async getPaged<T>(
    path: string,
    query: Record<string, unknown>,
    maxResults: number,
    pageSize = 100,
  ): Promise<CappedResult<T>> {
    const items: T[] = [];
    let page = 1;
    // Assigned from the first response before the while-condition reads it.
    let totalPages: number;
    let totalItems = 0;

    do {
      const res = await this.request<Page<T>>("GET", path, {
        query: { ...query, page, pageSize },
      });
      totalPages = res.totalPages;
      totalItems = res.totalItems;
      for (const item of res.items) {
        if (items.length >= maxResults) break;
        items.push(item);
      }
      page++;
    } while (page <= totalPages && items.length < maxResults);

    return { items, totalItems, truncated: items.length < totalItems };
  }

  private backoffMs(res: Response, attempt: number): number {
    const retryAfter = res.headers.get("retry-after");
    if (retryAfter) {
      const secs = Number(retryAfter);
      if (!Number.isNaN(secs) && secs >= 0) {
        return Math.min(secs * 1000, MAX_RETRY_AFTER_MS);
      }
    }
    return Math.min(1000 * 2 ** (attempt - 1), 8000);
  }

  private async parseBody(res: Response): Promise<unknown> {
    const text = await res.text();
    if (!text) return undefined;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
}
