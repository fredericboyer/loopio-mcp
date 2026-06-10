import { describe, it, expect, vi } from "vitest";
import { LoopioHttpClient, buildQuery } from "../src/loopio/http.js";
import type { LoopioConfig } from "../src/config.js";
import type { Page } from "../src/loopio/types.js";

const cfg = { apiBaseUrl: "https://api.loopio.com/data/v2" } as LoopioConfig;
const tokenManager = { getToken: vi.fn().mockResolvedValue("tok"), invalidate: vi.fn() };
const noSleep = () => Promise.resolve();

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function client(fetchFn: typeof fetch) {
  return new LoopioHttpClient(cfg, tokenManager as any, { fetchFn, sleep: noSleep, maxRetries: 3 });
}

describe("buildQuery", () => {
  it("repeats array params and JSON-encodes objects", () => {
    const q = buildQuery({ owners: [1, 2], filter: { searchQuery: "x" }, skip: undefined });
    expect(q).toContain("owners=1");
    expect(q).toContain("owners=2");
    expect(q).toContain("filter=" + encodeURIComponent('{"searchQuery":"x"}'));
    expect(q).not.toContain("skip");
  });
});

describe("LoopioHttpClient.request", () => {
  it("adds bearer auth and returns parsed json", async () => {
    const fetchFn = vi.fn().mockResolvedValue(json({ id: 7 }));
    const res = await client(fetchFn).request<{ id: number }>("GET", "/libraryEntries/7");
    expect(res).toEqual({ id: 7 });
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://api.loopio.com/data/v2/libraryEntries/7");
    expect(init.headers.authorization).toBe("Bearer tok");
  });

  it("invalidates the cached token and retries once with a fresh token on 401", async () => {
    const tokens = {
      getToken: vi.fn().mockResolvedValueOnce("stale").mockResolvedValueOnce("fresh"),
      invalidate: vi.fn(),
    };
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(json({ message: "expired" }, 401))
      .mockResolvedValueOnce(json({ id: 1 }));
    const c = new LoopioHttpClient(cfg, tokens, { fetchFn, sleep: noSleep, maxRetries: 3 });

    const res = await c.request("GET", "/projects/1");
    expect(res).toEqual({ id: 1 });
    expect(tokens.invalidate).toHaveBeenCalledTimes(1);
    expect(fetchFn.mock.calls[1][1].headers.authorization).toBe("Bearer fresh");
  });

  it("does not retry a second consecutive 401", async () => {
    const fetchFn = vi.fn().mockResolvedValue(json({ message: "nope" }, 401));
    await expect(client(fetchFn).request("GET", "/projects/1")).rejects.toMatchObject({
      name: "LoopioError",
      status: 401,
    });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("retries on 429 honoring Retry-After", async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(json({}, 429, { "retry-after": "2" }))
      .mockResolvedValueOnce(json({ ok: true }));
    const c = new LoopioHttpClient(cfg, tokenManager as any, { fetchFn, sleep, maxRetries: 3 });
    const res = await c.request("GET", "/projects");
    expect(res).toEqual({ ok: true });
    expect(sleep).toHaveBeenCalledWith(2000);
  });

  it("throws LoopioError with status and body on 4xx", async () => {
    const fetchFn = vi.fn().mockResolvedValue(json({ message: "bad request" }, 400));
    await expect(client(fetchFn).request("POST", "/libraryEntries")).rejects.toMatchObject({
      name: "LoopioError",
      status: 400,
    });
  });

  it("sends json-patch content type when jsonPatch is set", async () => {
    const fetchFn = vi.fn().mockResolvedValue(json({ id: 1 }));
    await client(fetchFn).request("PATCH", "/libraryEntries/1", {
      body: [{ op: "replace", path: "/answer/text", value: "hi" }],
      jsonPatch: true,
    });
    const [, init] = fetchFn.mock.calls[0];
    expect(init.headers["content-type"]).toBe("application/json-patch+json");
  });

  it("returns undefined for 204 responses", async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const res = await client(fetchFn).request("DELETE", "/libraryEntries/1");
    expect(res).toBeUndefined();
  });

  it("attaches a timeout signal to API requests", async () => {
    const fetchFn = vi.fn().mockResolvedValue(json({ id: 1 }));
    await client(fetchFn).request("GET", "/projects/1");
    const [, init] = fetchFn.mock.calls[0];
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("clamps a large Retry-After to 30s", async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(json({}, 429, { "retry-after": "3600" }))
      .mockResolvedValueOnce(json({ ok: true }));
    const c = new LoopioHttpClient(cfg, tokenManager as any, { fetchFn, sleep, maxRetries: 3 });
    await c.request("GET", "/projects");
    expect(sleep).toHaveBeenCalledWith(30_000);
  });

  it("ignores a negative Retry-After and uses exponential backoff", async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(json({}, 429, { "retry-after": "-5" }))
      .mockResolvedValueOnce(json({ ok: true }));
    const c = new LoopioHttpClient(cfg, tokenManager as any, { fetchFn, sleep, maxRetries: 3 });
    await c.request("GET", "/projects");
    expect(sleep).toHaveBeenCalledWith(1000);
  });

  it("honors a custom timeoutMs by rejecting with a TimeoutError", async () => {
    const fetchFn = vi.fn().mockImplementation(
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener("abort", () => reject(init.signal.reason));
        }),
    );
    const c = new LoopioHttpClient(cfg, tokenManager as any, {
      fetchFn,
      sleep: noSleep,
      timeoutMs: 5,
    });
    await expect(c.request("GET", "/projects")).rejects.toMatchObject({ name: "TimeoutError" });
  });

  it("treats Retry-After: 0 as an immediate retry", async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(json({}, 429, { "retry-after": "0" }))
      .mockResolvedValueOnce(json({ ok: true }));
    const c = new LoopioHttpClient(cfg, tokenManager as any, { fetchFn, sleep, maxRetries: 3 });
    await c.request("GET", "/projects");
    expect(sleep).toHaveBeenCalledWith(0);
  });
});

describe("LoopioHttpClient.getPaged", () => {
  function page(items: number[], totalItems: number, totalPages: number): Response {
    return json({ items: items.map((id) => ({ id })), totalItems, totalPages } satisfies Page<{
      id: number;
    }>);
  }

  it("follows pages up to totalPages and aggregates items", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(page([1, 2], 3, 2))
      .mockResolvedValueOnce(page([3], 3, 2));
    const res = await client(fetchFn).getPaged<{ id: number }>("/projects", {}, 100);
    expect(res.items.map((i) => i.id)).toEqual([1, 2, 3]);
    expect(res.totalItems).toBe(3);
    expect(res.truncated).toBe(false);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("stops and flags truncation at the cap", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(page([1, 2], 10, 5))
      .mockResolvedValueOnce(page([3, 4], 10, 5));
    const res = await client(fetchFn).getPaged<{ id: number }>("/projects", {}, 3);
    expect(res.items).toHaveLength(3);
    expect(res.truncated).toBe(true);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});
