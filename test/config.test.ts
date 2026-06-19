import { describe, it, expect } from "vitest";
import {
  loadConfig,
  deriveScopes,
  loadHttpConfig,
  exposureWarning,
  type LoopioConfig,
  type HttpConfig,
} from "../src/config.js";

const base = {
  LOOPIO_CLIENT_ID: "cid",
  LOOPIO_CLIENT_SECRET: "secret",
};

describe("deriveScopes", () => {
  it("read-only by default", () => {
    expect(deriveScopes(false, false)).toEqual(["library:read", "project:read"]);
  });
  it("adds write scopes when writes enabled", () => {
    expect(deriveScopes(true, false)).toEqual([
      "library:read",
      "project:read",
      "library:write",
      "project:write",
    ]);
  });
  it("adds delete scope only when writes also enabled", () => {
    expect(deriveScopes(true, true)).toContain("library:delete");
    expect(deriveScopes(false, true)).not.toContain("library:delete");
  });
});

describe("loadConfig", () => {
  it("requires client id and secret", () => {
    expect(() => loadConfig({})).toThrow(/LOOPIO_CLIENT_ID/);
  });
  it("derives urls and defaults (read-write incl. deletes by default)", () => {
    const c = loadConfig(base);
    expect(c.tokenUrl).toBe("https://api.loopio.com/oauth2/access_token");
    expect(c.apiBaseUrl).toBe("https://api.loopio.com/data/v2");
    expect(c.readOnly).toBe(false);
    expect(c.scopes).toContain("library:delete");
    expect(c.maxResults).toBe(200);
  });
  it("read-only toggle disables writes, deletes, and their scopes", () => {
    const c = loadConfig({ ...base, LOOPIO_READ_ONLY: "true" });
    expect(c.readOnly).toBe(true);
    expect(c.scopes).toEqual(["library:read", "project:read"]);
  });
  it("honors host and max-results override", () => {
    const c = loadConfig({
      ...base,
      LOOPIO_HOST: "api.int01.loopio.com",
      LOOPIO_MAX_RESULTS: "50",
    });
    expect(c.apiBaseUrl).toBe("https://api.int01.loopio.com/data/v2");
    expect(c.maxResults).toBe(50);
  });
  it("throws on non-numeric LOOPIO_MAX_RESULTS", () => {
    expect(() => loadConfig({ ...base, LOOPIO_MAX_RESULTS: "abc" })).toThrow(/LOOPIO_MAX_RESULTS/);
  });
  it("throws on zero LOOPIO_MAX_RESULTS", () => {
    expect(() => loadConfig({ ...base, LOOPIO_MAX_RESULTS: "0" })).toThrow(/LOOPIO_MAX_RESULTS/);
  });
});

describe("loadHttpConfig", () => {
  it("defaults to 0.0.0.0:3000 with localhost allowed hosts", () => {
    const c = loadHttpConfig({});
    expect(c.host).toBe("0.0.0.0");
    expect(c.port).toBe(3000);
    expect(c.allowedHosts).toEqual(["127.0.0.1:3000", "localhost:3000"]);
  });

  it("reads port and host from env and derives allowed hosts", () => {
    const c = loadHttpConfig({ LOOPIO_HTTP_PORT: "8080", LOOPIO_HTTP_HOST: "127.0.0.1" });
    expect(c.port).toBe(8080);
    expect(c.host).toBe("127.0.0.1");
    expect(c.allowedHosts).toEqual(["127.0.0.1:8080", "localhost:8080"]);
  });

  it("parses an explicit allowed-hosts list", () => {
    const c = loadHttpConfig({ LOOPIO_HTTP_ALLOWED_HOSTS: "mcp.internal, mcp.internal:443" });
    expect(c.allowedHosts).toEqual(["mcp.internal", "mcp.internal:443"]);
  });

  it("rejects an invalid port", () => {
    expect(() => loadHttpConfig({ LOOPIO_HTTP_PORT: "0" })).toThrow(/port/);
    expect(() => loadHttpConfig({ LOOPIO_HTTP_PORT: "70000" })).toThrow(/port/);
  });

  it("falls back to PORT when LOOPIO_HTTP_PORT is unset, preferring the explicit var", () => {
    expect(loadHttpConfig({ PORT: "8080" }).port).toBe(8080);
    expect(loadHttpConfig({ PORT: "8080", LOOPIO_HTTP_PORT: "9090" }).port).toBe(9090);
  });

  it("defaults to no proxy-auth with Easy Auth principal headers", () => {
    const c = loadHttpConfig({});
    expect(c.trustProxyAuth).toBe(false);
    expect(c.principal.header).toBe("x-ms-client-principal");
    expect(c.principal.nameHeader).toBe("x-ms-client-principal-name");
  });

  it("enables proxy-auth and overrides principal header/claims", () => {
    const c = loadHttpConfig({
      LOOPIO_TRUST_PROXY_AUTH: "true",
      LOOPIO_AUTH_PRINCIPAL_HEADER: "x-forwarded-user",
      LOOPIO_AUTH_ROLES_CLAIM: "groups",
    });
    expect(c.trustProxyAuth).toBe(true);
    expect(c.principal.header).toBe("x-forwarded-user");
    expect(c.principal.rolesClaim).toBe("groups");
  });
});

describe("exposureWarning", () => {
  const cfg = (over: Partial<LoopioConfig> = {}): LoopioConfig =>
    ({ readOnly: true, ...over }) as LoopioConfig;
  const http = (over: Partial<HttpConfig> = {}): HttpConfig =>
    ({ host: "0.0.0.0", trustProxyAuth: false, ...over }) as HttpConfig;

  it("warns on a non-loopback bind without proxy-auth, even when read-only", () => {
    const w = exposureWarning(cfg(), http());
    expect(w).toContain("not loopback");
    expect(w).toContain("LOOPIO_TRUST_PROXY_AUTH");
    expect(w).not.toContain("Write tools");
  });

  it("adds the write-risk note when not read-only", () => {
    const w = exposureWarning(cfg({ readOnly: false }), http());
    expect(w).toContain("Write tools are enabled");
    expect(w).toContain("LOOPIO_READ_ONLY=true");
  });

  it("is silent when proxy-auth is enabled", () => {
    expect(exposureWarning(cfg({ readOnly: false }), http({ trustProxyAuth: true }))).toBeNull();
  });

  it("is silent on a loopback bind", () => {
    expect(exposureWarning(cfg({ readOnly: false }), http({ host: "127.0.0.1" }))).toBeNull();
    expect(exposureWarning(cfg(), http({ host: "localhost" }))).toBeNull();
  });
});
