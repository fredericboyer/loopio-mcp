#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { createDeps, buildMcpServer } from "./app.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const deps = createDeps(config);
  const server = buildMcpServer(deps, config);

  const mode = config.readOnly ? "read-only" : "writes+deletes";
  // stderr is safe; stdout is reserved for the MCP protocol.
  console.error(`loopio-mcp starting (${mode}); host=${config.host}`);

  await server.connect(new StdioServerTransport());
}

main().catch((err) => {
  console.error("loopio-mcp failed to start:", err instanceof Error ? err.message : err);
  process.exit(1);
});
