import { describe, it, expect } from "vitest";
import { loadConfig, deriveScopes } from "../src/config.js";

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
      "library:read", "project:read", "library:write", "project:write",
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
  it("derives urls and defaults", () => {
    const c = loadConfig(base);
    expect(c.tokenUrl).toBe("https://api.loopio.com/oauth2/access_token");
    expect(c.apiBaseUrl).toBe("https://api.loopio.com/data/v2");
    expect(c.scopes).toEqual(["library:read", "project:read"]);
    expect(c.enableWrites).toBe(false);
    expect(c.maxResults).toBe(200);
  });
  it("honors host, flags, and scope override", () => {
    const c = loadConfig({
      ...base,
      LOOPIO_HOST: "api.int01.loopio.com",
      LOOPIO_ENABLE_WRITES: "true",
      LOOPIO_ENABLE_DELETES: "true",
      LOOPIO_MAX_RESULTS: "50",
    });
    expect(c.apiBaseUrl).toBe("https://api.int01.loopio.com/data/v2");
    expect(c.enableWrites).toBe(true);
    expect(c.enableDeletes).toBe(true);
    expect(c.scopes).toContain("library:delete");
    expect(c.maxResults).toBe(50);
  });
  it("ignores deletes when writes are off", () => {
    const c = loadConfig({ ...base, LOOPIO_ENABLE_DELETES: "true" });
    expect(c.enableDeletes).toBe(false);
    expect(c.scopes).not.toContain("library:delete");
  });
  it("throws on non-numeric LOOPIO_MAX_RESULTS", () => {
    expect(() => loadConfig({ ...base, LOOPIO_MAX_RESULTS: "abc" })).toThrow(/LOOPIO_MAX_RESULTS/);
  });
  it("throws on zero LOOPIO_MAX_RESULTS", () => {
    expect(() => loadConfig({ ...base, LOOPIO_MAX_RESULTS: "0" })).toThrow(/LOOPIO_MAX_RESULTS/);
  });
});
