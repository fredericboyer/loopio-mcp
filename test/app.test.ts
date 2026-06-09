import { describe, it, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createDeps, buildMcpServer, type Deps } from "../src/app.js";
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
    enableWrites: false,
    enableDeletes: false,
    maxResults: 200,
    ...over,
  };
}

function fakeDeps(): Deps {
  const library = {
    searchLibrary: async () => ({}),
    getLibraryEntry: async () => ({}),
    getLibraryStructure: async () => ({}),
    createLibraryEntry: async () => ({}),
    updateLibraryEntry: async () => ({}),
    deleteLibraryEntry: async () => ({}),
  };
  const projects = {
    listProjects: async () => ({}),
    getProject: async () => ({}),
    getProjectQuestions: async () => ({}),
    getProjectStatusSummary: async () => ({}),
    answerProjectEntry: async () => ({}),
  };
  return { library, projects } as unknown as Deps;
}

async function listToolNames(server: ReturnType<typeof buildMcpServer>): Promise<string[]> {
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  await server.connect(serverT);
  const client = new Client({ name: "t", version: "0" });
  await client.connect(clientT);
  const { tools } = await client.listTools();
  await client.close();
  return tools.map((t) => t.name);
}

describe("createDeps", () => {
  it("builds library and projects clients", () => {
    const deps = createDeps(makeConfig());
    expect(typeof deps.library.searchLibrary).toBe("function");
    expect(typeof deps.projects.listProjects).toBe("function");
  });
});

describe("buildMcpServer", () => {
  it("registers only read tools when writes are off", async () => {
    const names = await listToolNames(buildMcpServer(fakeDeps(), makeConfig()));
    expect(names).toContain("search_library");
    expect(names).not.toContain("create_library_entry");
    expect(names).not.toContain("delete_library_entry");
  });

  it("includes write tools when writes are on", async () => {
    const names = await listToolNames(
      buildMcpServer(fakeDeps(), makeConfig({ enableWrites: true })),
    );
    expect(names).toContain("create_library_entry");
    expect(names).not.toContain("delete_library_entry");
  });
});
