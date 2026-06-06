import type { LoopioHttpClient } from "./http.js";
import type {
  AnswerProjectEntryBody,
  CappedResult,
  Project,
  ProjectEntry,
  ProjectStatusSummaryResult,
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

  getProjectStatusSummary(lastUpdatedDateGt: string): Promise<ProjectStatusSummaryResult> {
    return this.http.request<ProjectStatusSummaryResult>("GET", "/projects/summary", {
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
