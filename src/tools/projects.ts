import { z } from "zod";
import type { ProjectsApi } from "../loopio/projects.js";
import { defineTool, type ToolDef } from "./registry.js";
import { guard, jsonResult } from "./result.js";

export function projectTools(api: ProjectsApi): ToolDef[] {
  return [
    defineTool({
      name: "list_projects",
      title: "List Loopio Projects",
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
    }),
    defineTool({
      name: "get_project",
      title: "Get Loopio Project",
      tier: "read",
      description: "Get a project's data by id.",
      inputSchema: { id: z.number() },
      handler: (args) => guard(async () => jsonResult(await api.getProject(args.id))),
    }),
    defineTool({
      name: "get_project_questions",
      title: "Get Loopio Project Questions",
      tier: "read",
      description:
        "List a project's entries (questions, current answers, status), filterable by section.",
      inputSchema: {
        projectId: z.number(),
        sectionId: z.number().optional(),
        subSectionId: z.number().optional(),
      },
      handler: (args) =>
        guard(async () => {
          const { projectId, ...rest } = args;
          const result = await api.getProjectQuestions(projectId, rest);
          return jsonResult({
            totalItems: result.totalItems,
            returned: result.items.length,
            truncated: result.truncated,
            items: result.items,
          });
        }),
    }),
    defineTool({
      name: "get_project_status_summary",
      title: "Get Loopio Project Status Summary",
      tier: "read",
      description:
        "Get status summaries for projects updated after a given ISO timestamp (for reporting/triage).",
      inputSchema: {
        lastUpdatedDateGt: z.string().describe("ISO-8601 timestamp, e.g. 2026-01-01T00:00:00Z"),
      },
      handler: (args) =>
        guard(async () => jsonResult(await api.getProjectStatusSummary(args.lastUpdatedDateGt))),
    }),
    defineTool({
      name: "answer_project_entry",
      title: "Answer Loopio Project Entry",
      tier: "write",
      description:
        "Set or update the answer (and optionally the question text) on a project entry.",
      inputSchema: {
        id: z.number().describe("Project entry id"),
        answerText: z.string().describe("The answer text to write"),
        question: z.string().optional().describe("Optionally update the question text"),
      },
      handler: (args) =>
        guard(async () => {
          const body: { question?: string; answer: { text: string } } = {
            answer: { text: args.answerText },
          };
          if (args.question !== undefined) body.question = args.question;
          return jsonResult(await api.answerProjectEntry(args.id, body));
        }),
    }),
  ];
}
