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
        language: z
          .string()
          .optional()
          .describe("Language code, e.g. 'en'. Empty shows all languages"),
        locations: z.array(locationSchema).optional().describe("Restrict to stacks/categories"),
        synonyms: z.boolean().optional(),
        exactPhrase: z.boolean().optional(),
        hasAttachment: z.boolean().optional(),
        searchInQuestions: z.boolean().optional(),
        searchInAnswers: z.boolean().optional(),
        searchInTags: z.boolean().optional(),
        lastUpdatedDate: z
          .object({ gte: z.string().optional(), lte: z.string().optional() })
          .optional()
          .describe("Filter by last-updated date range (ISO-8601 timestamps)"),
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
        expandMergeVariables: z
          .boolean()
          .optional()
          .describe("Substitute merge variable placeholders"),
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
      description:
        "List the full Library structure (stacks, categories, subcategories) for scoping searches and resolving location ids.",
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
