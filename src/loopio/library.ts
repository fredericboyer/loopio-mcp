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
