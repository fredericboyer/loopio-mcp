# Loopio MCP Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local stdio MCP server in TypeScript that exposes 11 task-oriented tools over the Loopio Data API (v2), with OAuth2 client-credentials auth, least-privilege scope derivation, read-only-by-default write gating, and pagination handling.

**Architecture:** Three layers. A `loopio/` domain client (no MCP dependency: auth, HTTP, library/projects calls) is a plain typed SDK. A `tools/` layer adapts it to MCP (zod schemas, result formatting, tier-based conditional registration). `server.ts` wires config + client + tools to a stdio transport. The domain client is unit-tested against an injected `fetch`; tool selection is unit-tested as a pure function.

**Tech Stack:** TypeScript (NodeNext ESM), Node 24 (global `fetch`), `@modelcontextprotocol/sdk`, `zod`, `vitest`, `tsx`.

**Spec:** `docs/superpowers/specs/2026-06-05-loopio-mcp-server-design.md`

---

## Conventions for the engineer

- This is an **ESM NodeNext** project. In `.ts` files, **relative imports must end in `.js`** (e.g. `import { loadConfig } from "./config.js"`), even though the source file is `.ts`. This is required by `moduleResolution: NodeNext`.
- Work from the project root `C:\Projects\loopio`. The git repo is already initialized; only the spec is committed so far.
- Run a single test file with `npx vitest run test/<file>.test.ts`. Run all with `npx vitest run`.
- Commit after each task. Do not include `Co-Authored-By` lines.

---

## File Structure

```
loopio/                          (project root, already a git repo)
  package.json                   deps, scripts, "type": "module", bin entry
  tsconfig.json                  NodeNext ESM, strict
  vitest.config.ts               node environment
  .gitignore                     node_modules, dist, .env
  .env.example                   documented env vars
  README.md                      setup, app registration, MCP client config
  src/
    config.ts                    loadConfig + deriveScopes (env -> LoopioConfig)
    server.ts                    entrypoint: build deps, register tools, stdio transport
    loopio/
      types.ts                   shared API types (LibraryEntry, Project, Entry, Page<T>, JsonPatchOp...)
      auth.ts                    TokenManager (token cache + refresh + scopes)
      http.ts                    LoopioError, buildQuery, LoopioHttpClient (request, getPaged)
      library.ts                 LibraryApi (search/get/structure/create/update/delete)
      projects.ts                ProjectsApi (list/get/questions/summary/answer)
    tools/
      registry.ts                ToolDef type, selectTools, registerTools
      result.ts                  jsonResult/textResult/errorResult/guard helpers
      library.ts                 libraryTools(api) -> ToolDef[]
      projects.ts                projectTools(api) -> ToolDef[]
  test/
    config.test.ts
    auth.test.ts
    http.test.ts
    library.test.ts
    projects.test.ts
    tools.test.ts
```

---

## Task 1: Project scaffolding

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`, `src/loopio/.gitkeep` (and dirs), `test/smoke.test.ts`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "loopio-mcp",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "bin": { "loopio-mcp": "dist/server.js" },
  "scripts": {
    "build": "tsc",
    "dev": "tsx src/server.ts",
    "start": "node dist/server.js",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.12.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": false,
    "sourceMap": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "test"]
}
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
```

- [ ] **Step 4: Create `.gitignore`**

```
node_modules/
dist/
.env
*.log
```

- [ ] **Step 5: Create directories and a smoke test `test/smoke.test.ts`**

```ts
import { describe, it, expect } from "vitest";

describe("smoke", () => {
  it("runs vitest", () => {
    expect(1 + 1).toBe(2);
  });
});
```

Also create empty dirs: `src/loopio/`, `src/tools/`.

- [ ] **Step 6: Install dependencies and run the smoke test**

Run: `npm install`
Then: `npx vitest run test/smoke.test.ts`
Expected: 1 passed.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts .gitignore test/smoke.test.ts
git commit -m "chore: scaffold loopio-mcp TypeScript project"
```

---

## Task 2: Config and scope derivation

**Files:**
- Create: `src/config.ts`
- Test: `test/config.test.ts`

- [ ] **Step 1: Write the failing test `test/config.test.ts`**

```ts
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/config.test.ts`
Expected: FAIL with cannot find module `../src/config.js`.

- [ ] **Step 3: Write `src/config.ts`**

```ts
export interface LoopioConfig {
  clientId: string;
  clientSecret: string;
  host: string;
  apiBasePath: string;
  tokenUrl: string;
  apiBaseUrl: string;
  scopes: string[];
  enableWrites: boolean;
  enableDeletes: boolean;
  maxResults: number;
}

type Env = Record<string, string | undefined>;

function boolEnv(v: string | undefined): boolean {
  return v === "true" || v === "1";
}

export function deriveScopes(enableWrites: boolean, enableDeletes: boolean): string[] {
  const scopes = ["library:read", "project:read"];
  if (enableWrites) scopes.push("library:write", "project:write");
  if (enableWrites && enableDeletes) scopes.push("library:delete");
  return scopes;
}

export function loadConfig(env: Env = process.env): LoopioConfig {
  const clientId = env.LOOPIO_CLIENT_ID;
  const clientSecret = env.LOOPIO_CLIENT_SECRET;
  if (!clientId) throw new Error("Missing required env var LOOPIO_CLIENT_ID");
  if (!clientSecret) throw new Error("Missing required env var LOOPIO_CLIENT_SECRET");

  const host = env.LOOPIO_HOST ?? "api.loopio.com";
  const apiBasePath = env.LOOPIO_API_BASE_PATH ?? "/data/v2";
  const enableWrites = boolEnv(env.LOOPIO_ENABLE_WRITES);
  // Deletes are ignored unless writes are also enabled.
  const enableDeletes = enableWrites && boolEnv(env.LOOPIO_ENABLE_DELETES);

  const scopes = env.LOOPIO_SCOPES
    ? env.LOOPIO_SCOPES.split(/\s+/).filter(Boolean)
    : deriveScopes(enableWrites, enableDeletes);

  const maxResults = env.LOOPIO_MAX_RESULTS ? Number(env.LOOPIO_MAX_RESULTS) : 200;

  return {
    clientId,
    clientSecret,
    host,
    apiBasePath,
    tokenUrl: `https://${host}/oauth2/access_token`,
    apiBaseUrl: `https://${host}${apiBasePath}`,
    scopes,
    enableWrites,
    enableDeletes,
    maxResults,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/config.test.ts`
Expected: all passed.

- [ ] **Step 5: Commit**

```bash
git add src/config.ts test/config.test.ts
git commit -m "feat: config loading and scope derivation"
```

---

## Task 3: Shared API types

**Files:**
- Create: `src/loopio/types.ts`

Types only; verified by the typecheck and by their use in later tasks. No standalone test.

- [ ] **Step 1: Write `src/loopio/types.ts`**

```ts
/** Standard paged envelope returned by all Loopio list endpoints. */
export interface Page<T> {
  totalItems: number;
  totalPages: number;
  items: T[];
}

/** Result of an internally-paginated fetch, capped at maxResults. */
export interface CappedResult<T> {
  items: T[];
  totalItems: number;
  truncated: boolean;
}

export interface ReferenceLabel {
  id: number;
  name: string;
}

export interface LibraryLocation {
  stackID: number;
  categoryID?: number;
  subCategoryID?: number;
}

export type LanguageCode = "de" | "en" | "es" | "fr" | "pt" | "other";

export interface LibrarySearchOptions {
  searchQuery?: string;
  language?: string;
  locations?: LibraryLocation[];
  synonyms?: boolean;
  exactPhrase?: boolean;
  hasAttachment?: boolean;
  searchInQuestions?: boolean;
  searchInAnswers?: boolean;
  searchInTags?: boolean;
  lastUpdatedDate?: { gte?: string; lte?: string };
}

export interface LibraryEntryQuestion {
  text: string;
  complianceOption?: Record<string, unknown> | null;
}

export interface CreateLibraryEntryBody {
  questions: LibraryEntryQuestion[];
  answer: { text: string | null };
  location: LibraryLocation;
  languageCode?: LanguageCode;
  tags?: string[];
}

export type JsonPatchOp = {
  op: "add" | "remove" | "replace" | "move" | "copy" | "test";
  path: string;
  value?: unknown;
  from?: string;
};

/** Library entry, project, project entry, and stack shapes are large and only
 *  partially consumed. Model them as open records plus the fields we surface. */
export type LibraryEntry = Record<string, unknown> & {
  id: number;
  status?: string;
};

export type Project = Record<string, unknown> & { id: number };
export type ProjectEntry = Record<string, unknown> & { id: number };
export type ProjectSummary = Record<string, unknown> & { id: number };
export type Stack = Record<string, unknown> & { id: number };

export interface AnswerProjectEntryBody {
  question?: string | null;
  answer: Record<string, unknown>;
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/loopio/types.ts
git commit -m "feat: shared Loopio API types"
```

---

## Task 4: TokenManager (auth)

**Files:**
- Create: `src/loopio/auth.ts`
- Test: `test/auth.test.ts`

- [ ] **Step 1: Write the failing test `test/auth.test.ts`**

```ts
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
    const fetchFn = vi.fn().mockImplementation(
      () => new Promise((r) => setTimeout(() => r(tokenResponse("tok1")), 10)),
    );
    const tm = new TokenManager(cfg, { fetchFn, now: () => 0 });
    const [a, b] = await Promise.all([tm.getToken(), tm.getToken()]);
    expect(a).toBe("tok1");
    expect(b).toBe("tok1");
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("throws a clear error on token failure", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response("bad creds", { status: 401 }),
    );
    const tm = new TokenManager(cfg, { fetchFn, now: () => 0 });
    await expect(tm.getToken()).rejects.toThrow(/token request failed.*401/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/auth.test.ts`
Expected: FAIL, cannot find module `../src/loopio/auth.js`.

- [ ] **Step 3: Write `src/loopio/auth.ts`**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/auth.test.ts`
Expected: all passed.

- [ ] **Step 5: Commit**

```bash
git add src/loopio/auth.ts test/auth.test.ts
git commit -m "feat: OAuth2 token manager with caching and refresh"
```

---

## Task 5: HTTP client — request, error, query building

**Files:**
- Create: `src/loopio/http.ts`
- Test: `test/http.test.ts`

- [ ] **Step 1: Write the failing test `test/http.test.ts`**

```ts
import { describe, it, expect, vi } from "vitest";
import { LoopioHttpClient, LoopioError, buildQuery } from "../src/loopio/http.js";
import type { LoopioConfig } from "../src/config.js";

const cfg = { apiBaseUrl: "https://api.loopio.com/data/v2" } as LoopioConfig;
const tokenManager = { getToken: vi.fn().mockResolvedValue("tok") };
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

  it("refreshes once and retries on 401", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(json({ message: "expired" }, 401))
      .mockResolvedValueOnce(json({ id: 1 }));
    const res = await client(fetchFn).request("GET", "/projects/1");
    expect(res).toEqual({ id: 1 });
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/http.test.ts`
Expected: FAIL, cannot find module `../src/loopio/http.js`.

- [ ] **Step 3: Write `src/loopio/http.ts`**

```ts
import type { LoopioConfig } from "../config.js";

export interface TokenSource {
  getToken(): Promise<string>;
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
}

export interface RequestOptions {
  query?: Record<string, unknown>;
  body?: unknown;
  jsonPatch?: boolean;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class LoopioHttpClient {
  private fetchFn: typeof fetch;
  private sleep: (ms: number) => Promise<void>;
  private maxRetries: number;

  constructor(
    private cfg: LoopioConfig,
    private tokens: TokenSource,
    opts: HttpClientOptions = {},
  ) {
    this.fetchFn = opts.fetchFn ?? fetch;
    this.sleep = opts.sleep ?? defaultSleep;
    this.maxRetries = opts.maxRetries ?? 3;
  }

  async request<T = unknown>(
    method: string,
    path: string,
    opts: RequestOptions = {},
  ): Promise<T> {
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

      const res = await this.fetchFn(url, { method, headers, body });

      if (res.status === 401 && !didAuthRetry) {
        didAuthRetry = true;
        continue; // token may be stale; getToken will refresh on next loop if needed
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

  private backoffMs(res: Response, attempt: number): number {
    const retryAfter = res.headers.get("retry-after");
    if (retryAfter) {
      const secs = Number(retryAfter);
      if (!Number.isNaN(secs)) return secs * 1000;
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
```

Note on the 401 retry: `getToken()` returns the cached token until near expiry, so a single 401 retry with the same token is harmless; the more important refresh path is time-based. If you later observe real 401s mid-token-life, add a `tokens.invalidate()` call here. Keep it simple for now.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/http.test.ts`
Expected: all passed.

- [ ] **Step 5: Commit**

```bash
git add src/loopio/http.ts test/http.test.ts
git commit -m "feat: Loopio HTTP client with auth, retries, and query building"
```

---

## Task 6: Pagination — getPaged

**Files:**
- Modify: `src/loopio/http.ts` (add `getPaged` method)
- Test: `test/http.test.ts` (add cases)

- [ ] **Step 1: Add failing tests to `test/http.test.ts`**

```ts
import type { Page } from "../src/loopio/types.js";

describe("LoopioHttpClient.getPaged", () => {
  function page(items: number[], totalItems: number, totalPages: number): Response {
    return json({ items: items.map((id) => ({ id })), totalItems, totalPages } satisfies Page<{ id: number }>);
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
```

- [ ] **Step 2: Run test to verify the new cases fail**

Run: `npx vitest run test/http.test.ts`
Expected: FAIL, `getPaged is not a function`.

- [ ] **Step 3: Add `getPaged` to `LoopioHttpClient` in `src/loopio/http.ts`**

Add this import at the top:

```ts
import type { Page, CappedResult } from "./types.js";
```

Add this method inside the `LoopioHttpClient` class:

```ts
async getPaged<T>(
  path: string,
  query: Record<string, unknown>,
  maxResults: number,
  pageSize = 100,
): Promise<CappedResult<T>> {
  const items: T[] = [];
  let page = 1;
  let totalPages = 1;
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/http.test.ts`
Expected: all passed.

- [ ] **Step 5: Commit**

```bash
git add src/loopio/http.ts test/http.test.ts
git commit -m "feat: internal pagination with max-results cap and truncation flag"
```

---

## Task 7: LibraryApi

**Files:**
- Create: `src/loopio/library.ts`
- Test: `test/library.test.ts`

- [ ] **Step 1: Write the failing test `test/library.test.ts`**

```ts
import { describe, it, expect, vi } from "vitest";
import { LibraryApi } from "../src/loopio/library.js";

function fakeHttp() {
  return {
    request: vi.fn(),
    getPaged: vi.fn(),
  };
}

describe("LibraryApi", () => {
  it("searchLibrary passes filter as an object and respects maxResults", async () => {
    const http = fakeHttp();
    http.getPaged.mockResolvedValue({ items: [{ id: 1 }], totalItems: 1, truncated: false });
    const api = new LibraryApi(http as any, 200);

    const res = await api.searchLibrary({ searchQuery: "vpn", searchInTags: false });
    expect(res.items).toHaveLength(1);
    const [path, query, max] = http.getPaged.mock.calls[0];
    expect(path).toBe("/libraryEntries");
    expect(query.filter).toEqual({ searchQuery: "vpn", searchInTags: false });
    expect(max).toBe(200);
  });

  it("getLibraryEntry requests by id with inline expansion", async () => {
    const http = fakeHttp();
    http.request.mockResolvedValue({ id: 9 });
    const api = new LibraryApi(http as any, 200);
    await api.getLibraryEntry(9, ["@mergeVariables"]);
    expect(http.request).toHaveBeenCalledWith("GET", "/libraryEntries/9", {
      query: { "inline[]": ["@mergeVariables"] },
    });
  });

  it("createLibraryEntry posts the body", async () => {
    const http = fakeHttp();
    http.request.mockResolvedValue({ id: 5 });
    const api = new LibraryApi(http as any, 200);
    const body = {
      questions: [{ text: "Q?" }],
      answer: { text: "A" },
      location: { stackID: 2 },
    };
    await api.createLibraryEntry(body);
    expect(http.request).toHaveBeenCalledWith("POST", "/libraryEntries", { body });
  });

  it("updateLibraryEntry sends a json patch", async () => {
    const http = fakeHttp();
    http.request.mockResolvedValue({ id: 5 });
    const api = new LibraryApi(http as any, 200);
    const patch = [{ op: "replace" as const, path: "/answer/text", value: "new" }];
    await api.updateLibraryEntry(5, patch);
    expect(http.request).toHaveBeenCalledWith("PATCH", "/libraryEntries/5", {
      body: patch,
      jsonPatch: true,
    });
  });

  it("deleteLibraryEntry issues a DELETE", async () => {
    const http = fakeHttp();
    http.request.mockResolvedValue(undefined);
    const api = new LibraryApi(http as any, 200);
    await api.deleteLibraryEntry(5);
    expect(http.request).toHaveBeenCalledWith("DELETE", "/libraryEntries/5", {});
  });

  it("getLibraryStructure reads stacks", async () => {
    const http = fakeHttp();
    http.request.mockResolvedValue({ items: [{ id: 1 }], totalItems: 1, totalPages: 1 });
    const api = new LibraryApi(http as any, 200);
    await api.getLibraryStructure();
    expect(http.request).toHaveBeenCalledWith("GET", "/stacks", { query: {} });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/library.test.ts`
Expected: FAIL, cannot find module `../src/loopio/library.js`.

- [ ] **Step 3: Write `src/loopio/library.ts`**

```ts
import type { LoopioHttpClient } from "./http.js";
import type {
  CappedResult,
  CreateLibraryEntryBody,
  JsonPatchOp,
  LibraryEntry,
  LibrarySearchOptions,
  Stack,
} from "./types.js";

export class LibraryApi {
  constructor(private http: LoopioHttpClient, private maxResults: number) {}

  searchLibrary(
    filter: LibrarySearchOptions,
    opts: { maxResults?: number } = {},
  ): Promise<CappedResult<LibraryEntry>> {
    return this.http.getPaged<LibraryEntry>(
      "/libraryEntries",
      { filter },
      opts.maxResults ?? this.maxResults,
    );
  }

  getLibraryEntry(id: number, inline?: string[]): Promise<LibraryEntry> {
    const query: Record<string, unknown> = {};
    if (inline?.length) query["inline[]"] = inline;
    return this.http.request<LibraryEntry>("GET", `/libraryEntries/${id}`, { query });
  }

  getLibraryStructure(fields?: string[]): Promise<unknown> {
    const query: Record<string, unknown> = {};
    if (fields?.length) query.fields = fields;
    return this.http.request<Stack[] | unknown>("GET", "/stacks", { query });
  }

  createLibraryEntry(body: CreateLibraryEntryBody): Promise<LibraryEntry> {
    return this.http.request<LibraryEntry>("POST", "/libraryEntries", { body });
  }

  updateLibraryEntry(id: number, patch: JsonPatchOp[]): Promise<LibraryEntry> {
    return this.http.request<LibraryEntry>("PATCH", `/libraryEntries/${id}`, {
      body: patch,
      jsonPatch: true,
    });
  }

  deleteLibraryEntry(id: number): Promise<void> {
    return this.http.request<void>("DELETE", `/libraryEntries/${id}`, {});
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/library.test.ts`
Expected: all passed.

- [ ] **Step 5: Commit**

```bash
git add src/loopio/library.ts test/library.test.ts
git commit -m "feat: LibraryApi domain client"
```

---

## Task 8: ProjectsApi

**Files:**
- Create: `src/loopio/projects.ts`
- Test: `test/projects.test.ts`

- [ ] **Step 1: Write the failing test `test/projects.test.ts`**

```ts
import { describe, it, expect, vi } from "vitest";
import { ProjectsApi } from "../src/loopio/projects.js";

function fakeHttp() {
  return { request: vi.fn(), getPaged: vi.fn() };
}

describe("ProjectsApi", () => {
  it("listProjects passes filters to getPaged", async () => {
    const http = fakeHttp();
    http.getPaged.mockResolvedValue({ items: [], totalItems: 0, truncated: false });
    const api = new ProjectsApi(http as any, 200);
    await api.listProjects({ rfxTypes: ["RFP"], owners: [3] });
    const [path, query] = http.getPaged.mock.calls[0];
    expect(path).toBe("/projects");
    expect(query).toEqual({ rfxTypes: ["RFP"], owners: [3] });
  });

  it("getProject reads by id", async () => {
    const http = fakeHttp();
    http.request.mockResolvedValue({ id: 4 });
    const api = new ProjectsApi(http as any, 200);
    await api.getProject(4);
    expect(http.request).toHaveBeenCalledWith("GET", "/projects/4", { query: {} });
  });

  it("getProjectQuestions filters by project and section", async () => {
    const http = fakeHttp();
    http.getPaged.mockResolvedValue({ items: [], totalItems: 0, truncated: false });
    const api = new ProjectsApi(http as any, 200);
    await api.getProjectQuestions(11, { sectionId: 2 });
    const [path, query] = http.getPaged.mock.calls[0];
    expect(path).toBe("/projectEntries");
    expect(query).toEqual({ projectId: 11, sectionId: 2 });
  });

  it("getProjectStatusSummary requires lastUpdatedDateGt", async () => {
    const http = fakeHttp();
    http.request.mockResolvedValue({ items: [], totalItems: 0 });
    const api = new ProjectsApi(http as any, 200);
    await api.getProjectStatusSummary("2026-01-01T00:00:00Z");
    expect(http.request).toHaveBeenCalledWith("GET", "/projects/summary", {
      query: { lastUpdatedDateGt: "2026-01-01T00:00:00Z" },
    });
  });

  it("answerProjectEntry PUTs the body", async () => {
    const http = fakeHttp();
    http.request.mockResolvedValue({ id: 1 });
    const api = new ProjectsApi(http as any, 200);
    await api.answerProjectEntry(1, { answer: { text: "yes" } });
    expect(http.request).toHaveBeenCalledWith("PUT", "/projectEntries/1", {
      body: { answer: { text: "yes" } },
      query: {},
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/projects.test.ts`
Expected: FAIL, cannot find module `../src/loopio/projects.js`.

- [ ] **Step 3: Write `src/loopio/projects.ts`**

```ts
import type { LoopioHttpClient } from "./http.js";
import type {
  AnswerProjectEntryBody,
  CappedResult,
  Project,
  ProjectEntry,
  ProjectSummary,
} from "./types.js";

export class ProjectsApi {
  constructor(private http: LoopioHttpClient, private maxResults: number) {}

  listProjects(
    opts: { rfxTypes?: string[]; owners?: number[]; maxResults?: number } = {},
  ): Promise<CappedResult<Project>> {
    const query: Record<string, unknown> = {};
    if (opts.rfxTypes?.length) query.rfxTypes = opts.rfxTypes;
    if (opts.owners?.length) query.owners = opts.owners;
    return this.http.getPaged<Project>("/projects", query, opts.maxResults ?? this.maxResults);
  }

  getProject(id: number, fields?: string[]): Promise<Project> {
    const query: Record<string, unknown> = {};
    if (fields?.length) query.fields = fields;
    return this.http.request<Project>("GET", `/projects/${id}`, { query });
  }

  getProjectQuestions(
    projectId: number,
    opts: { sectionId?: number; subSectionId?: number; inline?: string[]; maxResults?: number } = {},
  ): Promise<CappedResult<ProjectEntry>> {
    const query: Record<string, unknown> = { projectId };
    if (opts.sectionId !== undefined) query.sectionId = opts.sectionId;
    if (opts.subSectionId !== undefined) query.subSectionId = opts.subSectionId;
    if (opts.inline?.length) query["inline[]"] = opts.inline;
    return this.http.getPaged<ProjectEntry>(
      "/projectEntries",
      query,
      opts.maxResults ?? this.maxResults,
    );
  }

  getProjectStatusSummary(lastUpdatedDateGt: string): Promise<CappedResult<ProjectSummary>> {
    return this.http.request<CappedResult<ProjectSummary>>("GET", "/projects/summary", {
      query: { lastUpdatedDateGt },
    });
  }

  answerProjectEntry(
    id: number,
    body: AnswerProjectEntryBody,
    inline?: string[],
  ): Promise<ProjectEntry> {
    const query: Record<string, unknown> = {};
    if (inline?.length) query["inline[]"] = inline;
    return this.http.request<ProjectEntry>("PUT", `/projectEntries/${id}`, { body, query });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/projects.test.ts`
Expected: all passed.

- [ ] **Step 5: Commit**

```bash
git add src/loopio/projects.ts test/projects.test.ts
git commit -m "feat: ProjectsApi domain client"
```

---

## Task 9: Tool registry — tier selection and registration

**Files:**
- Create: `src/tools/registry.ts`
- Test: `test/tools.test.ts`

- [ ] **Step 1: Write the failing test `test/tools.test.ts`**

```ts
import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { selectTools, registerTools, type ToolDef } from "../src/tools/registry.js";

const defs: ToolDef[] = [
  { name: "read_tool", tier: "read", description: "r", inputSchema: {}, handler: async () => ok("r") },
  { name: "write_tool", tier: "write", description: "w", inputSchema: {}, handler: async () => ok("w") },
  { name: "delete_tool", tier: "delete", description: "d", inputSchema: {}, handler: async () => ok("d") },
];

function ok(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

describe("selectTools", () => {
  it("read-only exposes only read tools", () => {
    const names = selectTools(defs, { enableWrites: false, enableDeletes: false }).map((d) => d.name);
    expect(names).toEqual(["read_tool"]);
  });
  it("writes expose read + write but not delete", () => {
    const names = selectTools(defs, { enableWrites: true, enableDeletes: false }).map((d) => d.name);
    expect(names).toEqual(["read_tool", "write_tool"]);
  });
  it("writes + deletes expose all", () => {
    const names = selectTools(defs, { enableWrites: true, enableDeletes: true }).map((d) => d.name);
    expect(names).toEqual(["read_tool", "write_tool", "delete_tool"]);
  });
});

describe("registerTools", () => {
  it("registers exactly the selected tools on the server", () => {
    const server = { registerTool: vi.fn() };
    registerTools(server as any, defs, { enableWrites: false, enableDeletes: false });
    expect(server.registerTool).toHaveBeenCalledTimes(1);
    expect(server.registerTool.mock.calls[0][0]).toBe("read_tool");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/tools.test.ts`
Expected: FAIL, cannot find module `../src/tools/registry.js`.

- [ ] **Step 3: Write `src/tools/registry.ts`**

```ts
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ZodRawShape } from "zod";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export type Tier = "read" | "write" | "delete";

export interface ToolDef {
  name: string;
  tier: Tier;
  description: string;
  inputSchema: ZodRawShape;
  handler: (args: Record<string, unknown>) => Promise<CallToolResult>;
}

export interface ToolGating {
  enableWrites: boolean;
  enableDeletes: boolean;
}

export function selectTools(defs: ToolDef[], gating: ToolGating): ToolDef[] {
  return defs.filter((d) => {
    if (d.tier === "read") return true;
    if (d.tier === "write") return gating.enableWrites;
    if (d.tier === "delete") return gating.enableWrites && gating.enableDeletes;
    return false;
  });
}

export function registerTools(server: McpServer, defs: ToolDef[], gating: ToolGating): void {
  for (const def of selectTools(defs, gating)) {
    server.registerTool(
      def.name,
      { description: def.description, inputSchema: def.inputSchema },
      def.handler as never,
    );
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/tools.test.ts`
Expected: all passed.

- [ ] **Step 5: Commit**

```bash
git add src/tools/registry.ts test/tools.test.ts
git commit -m "feat: tool registry with tier-based gating"
```

---

## Task 10: Library tools

**Files:**
- Create: `src/tools/library.ts`
- Create: `src/tools/result.ts` (shared result formatting)
- Test: `test/tools.test.ts` (add cases)

- [ ] **Step 1: Add failing tests to `test/tools.test.ts`**

```ts
import { libraryTools } from "../src/tools/library.js";

function fakeLibraryApi() {
  return {
    searchLibrary: vi.fn(),
    getLibraryEntry: vi.fn(),
    getLibraryStructure: vi.fn(),
    createLibraryEntry: vi.fn(),
    updateLibraryEntry: vi.fn(),
    deleteLibraryEntry: vi.fn(),
  };
}

describe("libraryTools", () => {
  it("defines the five library tools with correct tiers", () => {
    const defs = libraryTools(fakeLibraryApi() as any);
    const byName = Object.fromEntries(defs.map((d) => [d.name, d.tier]));
    expect(byName).toEqual({
      search_library: "read",
      get_library_entry: "read",
      get_library_structure: "read",
      create_library_entry: "write",
      update_library_entry: "write",
      delete_library_entry: "delete",
    });
  });

  it("search_library handler returns text with truncation note", async () => {
    const api = fakeLibraryApi();
    api.searchLibrary.mockResolvedValue({ items: [{ id: 1 }], totalItems: 5, truncated: true });
    const def = libraryTools(api as any).find((d) => d.name === "search_library")!;
    const res = await def.handler({ searchQuery: "vpn" });
    expect(api.searchLibrary).toHaveBeenCalledWith({ searchQuery: "vpn" });
    expect(res.content[0].text).toContain("truncated");
    expect(res.content[0].text).toContain('"totalItems": 5');
  });

  it("delete_library_entry handler reports the deletion", async () => {
    const api = fakeLibraryApi();
    api.deleteLibraryEntry.mockResolvedValue(undefined);
    const def = libraryTools(api as any).find((d) => d.name === "delete_library_entry")!;
    const res = await def.handler({ id: 7 });
    expect(api.deleteLibraryEntry).toHaveBeenCalledWith(7);
    expect(res.content[0].text).toMatch(/deleted/i);
  });

  it("wraps Loopio errors as isError results", async () => {
    const api = fakeLibraryApi();
    const { LoopioError } = await import("../src/loopio/http.js");
    api.getLibraryEntry.mockRejectedValue(new LoopioError(404, { message: "nope" }, "GET", "/libraryEntries/9"));
    const def = libraryTools(api as any).find((d) => d.name === "get_library_entry")!;
    const res = await def.handler({ id: 9 });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("404");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/tools.test.ts`
Expected: FAIL, cannot find module `../src/tools/library.js`.

- [ ] **Step 3: Write `src/tools/result.ts`**

```ts
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { LoopioError } from "../loopio/http.js";

export function jsonResult(data: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

export function textResult(text: string): CallToolResult {
  return { content: [{ type: "text", text }] };
}

export function errorResult(err: unknown): CallToolResult {
  const text =
    err instanceof LoopioError
      ? err.message
      : err instanceof Error
        ? err.message
        : String(err);
  return { content: [{ type: "text", text }], isError: true };
}

/** Wrap a handler body so thrown errors become isError results. */
export async function guard(fn: () => Promise<CallToolResult>): Promise<CallToolResult> {
  try {
    return await fn();
  } catch (err) {
    return errorResult(err);
  }
}
```

- [ ] **Step 4: Write `src/tools/library.ts`**

```ts
import { z } from "zod";
import type { LibraryApi } from "../loopio/library.js";
import type { ToolDef } from "./registry.js";
import { guard, jsonResult, textResult } from "./result.js";

const locationSchema = z.object({
  stackID: z.number(),
  categoryID: z.number().optional(),
  subCategoryID: z.number().optional(),
});

export function libraryTools(api: LibraryApi): ToolDef[] {
  return [
    {
      name: "search_library",
      tier: "read",
      description:
        "Search the Loopio Library for approved Q&A entries. Provide at least one filter. " +
        "Returns matched entries with question, answer, location, and status.",
      inputSchema: {
        searchQuery: z.string().optional().describe("Free-text query over Library entries"),
        language: z.string().optional().describe("Language code, e.g. 'en'. Empty shows all languages"),
        locations: z.array(locationSchema).optional().describe("Restrict to stacks/categories"),
        synonyms: z.boolean().optional(),
        exactPhrase: z.boolean().optional(),
        hasAttachment: z.boolean().optional(),
        searchInQuestions: z.boolean().optional(),
        searchInAnswers: z.boolean().optional(),
        searchInTags: z.boolean().optional(),
      },
      handler: (args) =>
        guard(async () => {
          const result = await api.searchLibrary(args);
          return jsonResult({
            totalItems: result.totalItems,
            returned: result.items.length,
            truncated: result.truncated,
            items: result.items,
          });
        }),
    },
    {
      name: "get_library_entry",
      tier: "read",
      description: "Get the full detail of one Library entry by id.",
      inputSchema: {
        id: z.number().describe("Library entry id"),
        expandMergeVariables: z.boolean().optional().describe("Substitute merge variable placeholders"),
      },
      handler: (args) =>
        guard(async () => {
          const inline = args.expandMergeVariables ? ["@mergeVariables"] : undefined;
          return jsonResult(await api.getLibraryEntry(args.id as number, inline));
        }),
    },
    {
      name: "get_library_structure",
      tier: "read",
      description: "List the full Library structure (stacks, categories, subcategories) for scoping searches and resolving location ids.",
      inputSchema: {},
      handler: () => guard(async () => jsonResult(await api.getLibraryStructure())),
    },
    {
      name: "create_library_entry",
      tier: "write",
      description: "Create a new Library Q&A entry in a stack/category.",
      inputSchema: {
        questions: z
          .array(z.object({ text: z.string() }))
          .min(1)
          .describe("One or more question phrasings sharing the same answer"),
        answerText: z.string().describe("The answer text"),
        location: locationSchema.describe("Where to file the entry (stackID required)"),
        languageCode: z.enum(["de", "en", "es", "fr", "pt", "other"]).optional(),
        tags: z.array(z.string()).optional(),
      },
      handler: (args) =>
        guard(async () => {
          const created = await api.createLibraryEntry({
            questions: args.questions as { text: string }[],
            answer: { text: args.answerText as string },
            location: args.location as { stackID: number },
            languageCode: args.languageCode as never,
            tags: args.tags as string[] | undefined,
          });
          return jsonResult(created);
        }),
    },
    {
      name: "update_library_entry",
      tier: "write",
      description:
        "Update a Library entry via JSON Patch. Example op: " +
        '{ "op": "replace", "path": "/answer/text", "value": "new answer" }.',
      inputSchema: {
        id: z.number(),
        patch: z
          .array(
            z.object({
              op: z.enum(["add", "remove", "replace", "move", "copy", "test"]),
              path: z.string(),
              value: z.unknown().optional(),
              from: z.string().optional(),
            }),
          )
          .min(1),
      },
      handler: (args) =>
        guard(async () =>
          jsonResult(await api.updateLibraryEntry(args.id as number, args.patch as never)),
        ),
    },
    {
      name: "delete_library_entry",
      tier: "delete",
      description: "Permanently delete a Library entry. Irreversible.",
      inputSchema: { id: z.number() },
      handler: (args) =>
        guard(async () => {
          await api.deleteLibraryEntry(args.id as number);
          return textResult(`Library entry ${args.id} deleted.`);
        }),
    },
  ];
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run test/tools.test.ts`
Expected: all passed.

- [ ] **Step 6: Commit**

```bash
git add src/tools/library.ts src/tools/result.ts test/tools.test.ts
git commit -m "feat: library MCP tools with result formatting and error guards"
```

---

## Task 11: Project tools

**Files:**
- Create: `src/tools/projects.ts`
- Test: `test/tools.test.ts` (add cases)

- [ ] **Step 1: Add failing tests to `test/tools.test.ts`**

```ts
import { projectTools } from "../src/tools/projects.js";

function fakeProjectsApi() {
  return {
    listProjects: vi.fn(),
    getProject: vi.fn(),
    getProjectQuestions: vi.fn(),
    getProjectStatusSummary: vi.fn(),
    answerProjectEntry: vi.fn(),
  };
}

describe("projectTools", () => {
  it("defines the five project tools with correct tiers", () => {
    const defs = projectTools(fakeProjectsApi() as any);
    const byName = Object.fromEntries(defs.map((d) => [d.name, d.tier]));
    expect(byName).toEqual({
      list_projects: "read",
      get_project: "read",
      get_project_questions: "read",
      get_project_status_summary: "read",
      answer_project_entry: "write",
    });
  });

  it("answer_project_entry handler builds the body", async () => {
    const api = fakeProjectsApi();
    api.answerProjectEntry.mockResolvedValue({ id: 3 });
    const def = projectTools(api as any).find((d) => d.name === "answer_project_entry")!;
    await def.handler({ id: 3, answerText: "Yes, we comply." });
    expect(api.answerProjectEntry).toHaveBeenCalledWith(3, { answer: { text: "Yes, we comply." } });
  });

  it("get_project_questions passes projectId", async () => {
    const api = fakeProjectsApi();
    api.getProjectQuestions.mockResolvedValue({ items: [], totalItems: 0, truncated: false });
    const def = projectTools(api as any).find((d) => d.name === "get_project_questions")!;
    await def.handler({ projectId: 12 });
    expect(api.getProjectQuestions).toHaveBeenCalledWith(12, {});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/tools.test.ts`
Expected: FAIL, cannot find module `../src/tools/projects.js`.

- [ ] **Step 3: Write `src/tools/projects.ts`**

```ts
import { z } from "zod";
import type { ProjectsApi } from "../loopio/projects.js";
import type { ToolDef } from "./registry.js";
import { guard, jsonResult } from "./result.js";

export function projectTools(api: ProjectsApi): ToolDef[] {
  return [
    {
      name: "list_projects",
      tier: "read",
      description: "List Loopio projects, optionally filtered by RFx type and owner ids.",
      inputSchema: {
        rfxTypes: z.array(z.enum(["RFP", "RFI", "DDQ", "SQ", "PP", "OTHER"])).optional(),
        owners: z.array(z.number()).optional().describe("Owner user ids"),
      },
      handler: (args) =>
        guard(async () => {
          const result = await api.listProjects(args);
          return jsonResult({
            totalItems: result.totalItems,
            returned: result.items.length,
            truncated: result.truncated,
            items: result.items,
          });
        }),
    },
    {
      name: "get_project",
      tier: "read",
      description: "Get a project's data by id.",
      inputSchema: { id: z.number() },
      handler: (args) => guard(async () => jsonResult(await api.getProject(args.id as number))),
    },
    {
      name: "get_project_questions",
      tier: "read",
      description: "List a project's entries (questions, current answers, status), filterable by section.",
      inputSchema: {
        projectId: z.number(),
        sectionId: z.number().optional(),
        subSectionId: z.number().optional(),
      },
      handler: (args) =>
        guard(async () => {
          const { projectId, ...rest } = args as {
            projectId: number;
            sectionId?: number;
            subSectionId?: number;
          };
          const result = await api.getProjectQuestions(projectId, rest);
          return jsonResult({
            totalItems: result.totalItems,
            returned: result.items.length,
            truncated: result.truncated,
            items: result.items,
          });
        }),
    },
    {
      name: "get_project_status_summary",
      tier: "read",
      description: "Get status summaries for projects updated after a given ISO timestamp (for reporting/triage).",
      inputSchema: {
        lastUpdatedDateGt: z.string().describe("ISO-8601 timestamp, e.g. 2026-01-01T00:00:00Z"),
      },
      handler: (args) =>
        guard(async () =>
          jsonResult(await api.getProjectStatusSummary(args.lastUpdatedDateGt as string)),
        ),
    },
    {
      name: "answer_project_entry",
      tier: "write",
      description: "Set or update the answer (and optionally the question text) on a project entry.",
      inputSchema: {
        id: z.number().describe("Project entry id"),
        answerText: z.string().describe("The answer text to write"),
        question: z.string().optional().describe("Optionally update the question text"),
      },
      handler: (args) =>
        guard(async () => {
          const body: { question?: string; answer: { text: string } } = {
            answer: { text: args.answerText as string },
          };
          if (args.question !== undefined) body.question = args.question as string;
          return jsonResult(await api.answerProjectEntry(args.id as number, body));
        }),
    },
  ];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/tools.test.ts`
Expected: all passed.

- [ ] **Step 5: Commit**

```bash
git add src/tools/projects.ts test/tools.test.ts
git commit -m "feat: project MCP tools"
```

---

## Task 12: Server entrypoint and wiring

**Files:**
- Create: `src/server.ts`

No unit test (it is composition + I/O). Verified by typecheck, build, and a startup smoke check.

- [ ] **Step 1: Write `src/server.ts`**

```ts
#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { TokenManager } from "./loopio/auth.js";
import { LoopioHttpClient } from "./loopio/http.js";
import { LibraryApi } from "./loopio/library.js";
import { ProjectsApi } from "./loopio/projects.js";
import { libraryTools } from "./tools/library.js";
import { projectTools } from "./tools/projects.js";
import { registerTools } from "./tools/registry.js";

async function main(): Promise<void> {
  const config = loadConfig();

  const tokens = new TokenManager(config);
  const http = new LoopioHttpClient(config, tokens);
  const library = new LibraryApi(http, config.maxResults);
  const projects = new ProjectsApi(http, config.maxResults);

  const server = new McpServer({ name: "loopio-mcp", version: "0.1.0" });

  const defs = [...libraryTools(library), ...projectTools(projects)];
  registerTools(server, defs, {
    enableWrites: config.enableWrites,
    enableDeletes: config.enableDeletes,
  });

  const mode = config.enableDeletes
    ? "writes+deletes"
    : config.enableWrites
      ? "writes"
      : "read-only";
  // stderr is safe; stdout is reserved for the MCP protocol.
  console.error(`loopio-mcp starting (${mode}); host=${config.host}`);

  await server.connect(new StdioServerTransport());
}

main().catch((err) => {
  console.error("loopio-mcp failed to start:", err instanceof Error ? err.message : err);
  process.exit(1);
});
```

- [ ] **Step 2: Typecheck and build**

Run: `npx tsc --noEmit`
Expected: no errors.
Then: `npm run build`
Expected: compiles to `dist/`.

- [ ] **Step 3: Startup smoke check (fails fast without creds)**

Run: `node dist/server.js`
Expected: exits non-zero with `Missing required env var LOOPIO_CLIENT_ID`.

- [ ] **Step 4: Startup smoke check (read-only mode boots)**

Run (PowerShell):
```powershell
$env:LOOPIO_CLIENT_ID="x"; $env:LOOPIO_CLIENT_SECRET="y"; node dist/server.js
```
Expected: prints `loopio-mcp starting (read-only); host=api.loopio.com` to stderr and then waits on stdin (no crash). Press Ctrl+C to exit. (It will not make API calls until a tool is invoked.)

- [ ] **Step 5: Run the full test suite**

Run: `npx vitest run`
Expected: all test files pass.

- [ ] **Step 6: Commit**

```bash
git add src/server.ts
git commit -m "feat: stdio server entrypoint with conditional tool registration"
```

---

## Task 13: Documentation and env example

**Files:**
- Create: `.env.example`, `README.md`

- [ ] **Step 1: Write `.env.example`**

```
# Required: OAuth2 client credentials from Loopio Admin > Integrations > For Developers
LOOPIO_CLIENT_ID=
LOOPIO_CLIENT_SECRET=

# Optional: datacenter host (default api.loopio.com; api.int01.loopio.com for testing)
# LOOPIO_HOST=api.loopio.com
# LOOPIO_API_BASE_PATH=/data/v2

# Write gating (default read-only). Enable deletes requires writes also enabled.
# LOOPIO_ENABLE_WRITES=false
# LOOPIO_ENABLE_DELETES=false

# Optional: override requested scopes (default derived from the flags above)
# LOOPIO_SCOPES=library:read project:read

# Optional: max results returned per list/search tool (default 200)
# LOOPIO_MAX_RESULTS=200
```

- [ ] **Step 2: Write `README.md`**

````markdown
# loopio-mcp

A local [MCP](https://modelcontextprotocol.io) server exposing the Loopio Data API (v2) to MCP clients (Claude Desktop, Claude Code). Read-only by default; writes and deletes are opt-in.

## Tools

Read (always on): `search_library`, `get_library_entry`, `get_library_structure`, `list_projects`, `get_project`, `get_project_questions`, `get_project_status_summary`.

Write (require `LOOPIO_ENABLE_WRITES=true`): `create_library_entry`, `update_library_entry`, `answer_project_entry`.

Delete (require `LOOPIO_ENABLE_WRITES=true` and `LOOPIO_ENABLE_DELETES=true`): `delete_library_entry`.

## Setup

1. In Loopio, sign in as an Admin and go to **Admin > Integrations > For Developers > Add an App**. Select the scopes you need (`library:read`, `project:read`, and optionally `library:write`, `project:write`, `library:delete`). Scopes cannot be changed after creation, so select every scope you might enable. Copy the Client ID and Secret (the secret is shown only once).
2. `npm install && npm run build`
3. Configure your MCP client (below).

## MCP client configuration

```json
{
  "mcpServers": {
    "loopio": {
      "command": "node",
      "args": ["C:/Projects/loopio/dist/server.js"],
      "env": {
        "LOOPIO_CLIENT_ID": "your-client-id",
        "LOOPIO_CLIENT_SECRET": "your-client-secret",
        "LOOPIO_ENABLE_WRITES": "false"
      }
    }
  }
}
```

To enable writes, set `LOOPIO_ENABLE_WRITES` to `true` (and `LOOPIO_ENABLE_DELETES` to `true` to also allow deletes). The server requests only the scopes matching the enabled tiers.

## Testing against the mock server

You can exercise the tools without real credentials by pointing the base URL at Loopio's Stoplight mock:

```powershell
$env:LOOPIO_CLIENT_ID="mock"; $env:LOOPIO_CLIENT_SECRET="mock"
$env:LOOPIO_API_BASE_PATH="/loopio/loopio-api/84330"; $env:LOOPIO_HOST="stoplight.io"
```

Note: the mock does not implement OAuth, so this only exercises request/response shapes for endpoints that the mock serves. Use the live API for end-to-end verification.

## Development

- `npm test` runs the unit tests.
- `npm run dev` runs the server from source via tsx.
````

- [ ] **Step 3: Commit**

```bash
git add .env.example README.md
git commit -m "docs: README and env example"
```

---

## Task 14: Optional live smoke test (manual, requires real creds)

**Files:** none (manual verification documented here)

- [ ] **Step 1: Run a read-only smoke test with real credentials**

Run (PowerShell, substitute real values):
```powershell
$env:LOOPIO_CLIENT_ID="<real>"; $env:LOOPIO_CLIENT_SECRET="<real>"
npm run build
node dist/server.js
```

Then from an MCP client connected to this server, call `get_library_structure` and `search_library` with `{ "searchQuery": "security" }`. Confirm results return without auth errors.

- [ ] **Step 2: Confirm scope gating**

With `LOOPIO_ENABLE_WRITES` unset, confirm the client does not list `create_library_entry`, `update_library_entry`, `answer_project_entry`, or `delete_library_entry`. Set `LOOPIO_ENABLE_WRITES=true` and confirm the three write tools appear but `delete_library_entry` does not. Set `LOOPIO_ENABLE_DELETES=true` and confirm `delete_library_entry` appears.

- [ ] **Step 3: Note any rate-limit behavior**

If the live API returns `429`, confirm the client backs off and recovers. Record observed limits in the README if documented behavior differs.

---

## Notes for the implementer

- If the MCP SDK version resolves to a different major and `registerTool`'s signature differs, check `node_modules/@modelcontextprotocol/sdk/dist/esm/server/mcp.d.ts` for the current shape. The plan uses the `registerTool(name, { description, inputSchema }, handler)` form from SDK 1.x.
- `inputSchema` values are a **ZodRawShape** (a plain object of zod validators), not a `z.object(...)`. The SDK builds the JSON schema from the shape.
- Keep stdout clean: only the MCP transport writes to stdout. All logging goes to stderr (`console.error`).
```
