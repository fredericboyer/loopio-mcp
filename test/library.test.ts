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
