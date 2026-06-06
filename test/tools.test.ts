import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { selectTools, registerTools, type ToolDef } from "../src/tools/registry.js";
import { libraryTools } from "../src/tools/library.js";

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
  it("does not expose delete (or write) when writes are off even if deletes on", () => {
    const names = selectTools(defs, { enableWrites: false, enableDeletes: true }).map((d) => d.name);
    expect(names).toEqual(["read_tool"]);
  });
});

describe("registerTools", () => {
  it("registers exactly the selected tools on the server", () => {
    const server = { registerTool: vi.fn() };
    registerTools(server as any, defs, { enableWrites: false, enableDeletes: false });
    expect(server.registerTool).toHaveBeenCalledTimes(1);
    expect(server.registerTool.mock.calls[0][0]).toBe("read_tool");
    expect(server.registerTool.mock.calls[0][1]).toMatchObject({ description: "r" });
    expect(server.registerTool.mock.calls[0][1]).toHaveProperty("inputSchema");
    expect(typeof server.registerTool.mock.calls[0][2]).toBe("function");
  });
});

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
  it("defines the six library tools with correct tiers", () => {
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
