#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { TokenManager } from "./loopio/auth.js";
import { LoopioHttpClient } from "./loopio/http.js";
import { LibraryApi } from "./loopio/library.js";
import { ProjectsApi } from "./loopio/projects.js";
import { libraryTools } from "./tools/library.js";
import { projectTools } from "./tools/projects.js";
import { registerTools } from "./tools/registry.js";

async function main(): Promise<void> {
  const config = loadConfig();

  const tokens = new TokenManager(config);
  const http = new LoopioHttpClient(config, tokens);
  const library = new LibraryApi(http, config.maxResults);
  const projects = new ProjectsApi(http, config.maxResults);

  const server = new McpServer({ name: "loopio-mcp", version: "0.1.0" });

  const defs = [...libraryTools(library), ...projectTools(projects)];
  registerTools(server, defs, {
    enableWrites: config.enableWrites,
    enableDeletes: config.enableDeletes,
  });

  const mode = config.enableDeletes
    ? "writes+deletes"
    : config.enableWrites
      ? "writes"
      : "read-only";
  // stderr is safe; stdout is reserved for the MCP protocol.
  console.error(`loopio-mcp starting (${mode}); host=${config.host}`);

  await server.connect(new StdioServerTransport());
}

main().catch((err) => {
  console.error("loopio-mcp failed to start:", err instanceof Error ? err.message : err);
  process.exit(1);
});
