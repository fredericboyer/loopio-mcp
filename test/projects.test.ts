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
