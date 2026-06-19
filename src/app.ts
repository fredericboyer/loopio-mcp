import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { LoopioConfig } from "./config.js";
import { TokenManager } from "./loopio/auth.js";
import { LoopioHttpClient } from "./loopio/http.js";
import { LibraryApi } from "./loopio/library.js";
import { ProjectsApi } from "./loopio/projects.js";
import { libraryTools } from "./tools/library.js";
import { projectTools } from "./tools/projects.js";
import { registerTools } from "./tools/registry.js";

export interface Deps {
  library: LibraryApi;
  projects: ProjectsApi;
}

/** Build the shared, expensive dependencies once per process. */
export function createDeps(config: LoopioConfig): Deps {
  const tokens = new TokenManager(config);
  const http = new LoopioHttpClient(config, tokens);
  const library = new LibraryApi(http, config.maxResults);
  const projects = new ProjectsApi(http, config.maxResults);
  return { library, projects };
}

/** Build a configured McpServer. Cheap; call once for stdio, once per HTTP request. */
export function buildMcpServer(deps: Deps, config: LoopioConfig): McpServer {
  const server = new McpServer({ name: "loopio-mcp", version: "0.3.1" });
  const defs = [...libraryTools(deps.library), ...projectTools(deps.projects)];
  // Config carries a single read-only switch; the tool engine keeps the finer
  // read/write/delete tiers, so map across the boundary here.
  registerTools(server, defs, {
    enableWrites: !config.readOnly,
    enableDeletes: !config.readOnly,
  });
  return server;
}
