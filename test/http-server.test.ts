import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createHttpApp } from "../src/http-app.js";
import type { Deps } from "../src/app.js";
import type { LoopioConfig } from "../src/config.js";

function makeConfig(over: Partial<LoopioConfig> = {}): LoopioConfig {
  return {
    clientId: "id",
    clientSecret: "secret",
    host: "api.loopio.com",
    apiBasePath: "/data/v2",
    tokenUrl: "https://api.loopio.com/oauth2/access_token",
    apiBaseUrl: "https://api.loopio.com/data/v2",
    scopes: ["library:read", "project:read"],
    readOnly: true,
    maxResults: 200,
    ...over,
  };
}

const fakeLibrary = {
  searchLibrary: vi.fn(),
  getLibraryEntry: vi.fn(),
  getLibraryStructure: vi.fn(),
  createLibraryEntry: vi.fn(),
  updateLibraryEntry: vi.fn(),
  deleteLibraryEntry: vi.fn(),
};
const fakeProjects = {
  listProjects: vi.fn(),
  getProject: vi.fn(),
  getProjectQuestions: vi.fn(),
  getProjectStatusSummary: vi.fn(),
  answerProjectEntry: vi.fn(),
};

const deps = { library: fakeLibrary, projects: fakeProjects } as unknown as Deps;

let httpServer: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = createHttpApp(deps, makeConfig(), {
    enableDnsRebindingProtection: false,
    allowedHosts: [],
  });
  await new Promise<void>((resolve) => {
    httpServer = app.listen(0, "127.0.0.1", () => resolve());
  });
  const { port } = httpServer.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
});

async function connect(): Promise<Client> {
  const client = new Client({ name: "test", version: "0.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`)));
  return client;
}

describe("createHttpApp over Streamable HTTP", () => {
  it("lists read-tier tools (writes off)", async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain("search_library");
    expect(names).not.toContain("create_library_entry");
    await client.close();
  });

  it("calls search_library and returns the canned result", async () => {
    fakeLibrary.searchLibrary.mockResolvedValue({
      items: [{ id: 1 }],
      totalItems: 1,
      truncated: false,
    });
    const client = await connect();
    const res = await client.callTool({
      name: "search_library",
      arguments: { searchQuery: "vpn" },
    });
    expect(fakeLibrary.searchLibrary).toHaveBeenCalled();
    const text = (res.content as Array<{ type: string; text: string }>)[0].text;
    expect(text).toContain('"totalItems": 1');
    await client.close();
  });

  it("returns 405 on GET /mcp", async () => {
    const r = await fetch(`${baseUrl}/mcp`);
    expect(r.status).toBe(405);
  });

  it("returns 405 on DELETE /mcp", async () => {
    const r = await fetch(`${baseUrl}/mcp`, { method: "DELETE" });
    expect(r.status).toBe(405);
  });

  it("healthz returns 200", async () => {
    const r = await fetch(`${baseUrl}/healthz`);
    expect(r.status).toBe(200);
  });

  it("returns 400 on a malformed JSON body", async () => {
    const r = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: "{not json",
    });
    expect(r.status).toBe(400);
  });
});

describe("createHttpApp with proxy-auth", () => {
  let authServer: Server;
  let authUrl: string;

  beforeAll(async () => {
    const app = createHttpApp(deps, makeConfig(), {
      enableDnsRebindingProtection: false,
      allowedHosts: [],
      trustProxyAuth: true,
    });
    await new Promise<void>((resolve) => {
      authServer = app.listen(0, "127.0.0.1", () => resolve());
    });
    const { port } = authServer.address() as AddressInfo;
    authUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => authServer.close(() => resolve()));
  });

  it("rejects a request with no forwarded identity (401)", async () => {
    const r = await fetch(`${authUrl}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    });
    expect(r.status).toBe(401);
  });

  it("accepts a request carrying a forwarded identity", async () => {
    const client = new Client({ name: "test", version: "0.0.0" });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`${authUrl}/mcp`), {
        requestInit: { headers: { "x-ms-client-principal-name": "jane@amilia.com" } },
      }),
    );
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toContain("search_library");
    await client.close();
  });
});
