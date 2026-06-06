import { describe, it, expect, vi } from "vitest";
import { TokenManager } from "../src/loopio/auth.js";
import type { LoopioConfig } from "../src/config.js";

const cfg = {
  clientId: "cid",
  clientSecret: "secret",
  tokenUrl: "https://api.loopio.com/oauth2/access_token",
  scopes: ["library:read", "project:read"],
} as unknown as LoopioConfig;

function tokenResponse(token: string, expiresIn = 3600) {
  return new Response(
    JSON.stringify({ token_type: "Bearer", expires_in: expiresIn, access_token: token }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

describe("TokenManager", () => {
  it("requests a token with form-encoded client credentials and scopes", async () => {
    const fetchFn = vi.fn().mockResolvedValue(tokenResponse("tok1"));
    const tm = new TokenManager(cfg, { fetchFn, now: () => 0 });

    const token = await tm.getToken();
    expect(token).toBe("tok1");

    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe(cfg.tokenUrl);
    expect(init.method).toBe("POST");
    expect(init.headers["content-type"]).toMatch(/x-www-form-urlencoded/);
    const body = String(init.body);
    expect(body).toContain("grant_type=client_credentials");
    expect(body).toContain("client_id=cid");
    expect(body).toContain("scope=library%3Aread+project%3Aread");
  });

  it("caches the token until near expiry", async () => {
    const fetchFn = vi.fn().mockResolvedValue(tokenResponse("tok1", 3600));
    let t = 0;
    const tm = new TokenManager(cfg, { fetchFn, now: () => t });

    await tm.getToken();
    t = 1000 * 1000; // 1000s later, still valid
    await tm.getToken();
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("refreshes within 60s of expiry", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse("tok1", 3600))
      .mockResolvedValueOnce(tokenResponse("tok2", 3600));
    let t = 0;
    const tm = new TokenManager(cfg, { fetchFn, now: () => t });

    expect(await tm.getToken()).toBe("tok1");
    t = 3600_000 - 30_000; // 30s before expiry -> refresh
    expect(await tm.getToken()).toBe("tok2");
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("shares a single in-flight refresh", async () => {
    const fetchFn = vi
      .fn()
      .mockImplementation(() => new Promise((r) => setTimeout(() => r(tokenResponse("tok1")), 10)));
    const tm = new TokenManager(cfg, { fetchFn, now: () => 0 });
    const [a, b] = await Promise.all([tm.getToken(), tm.getToken()]);
    expect(a).toBe("tok1");
    expect(b).toBe("tok1");
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("throws a clear error on token failure", async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response("bad creds", { status: 401 }));
    const tm = new TokenManager(cfg, { fetchFn, now: () => 0 });
    await expect(tm.getToken()).rejects.toThrow(/token request failed.*401/i);
  });
});
