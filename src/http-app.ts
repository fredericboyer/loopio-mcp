import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { LoopioConfig } from "./config.js";
import { buildMcpServer, type Deps } from "./app.js";

export interface HttpAppOptions {
  enableDnsRebindingProtection: boolean;
  allowedHosts: string[];
}

function jsonRpcError(res: express.Response, status: number, code: number, message: string): void {
  res.status(status).json({ jsonrpc: "2.0", error: { code, message }, id: null });
}

export function createHttpApp(
  deps: Deps,
  config: LoopioConfig,
  opts: HttpAppOptions,
): express.Express {
  const app = express();
  app.use(express.json());

  app.get("/healthz", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  app.post("/mcp", async (req, res) => {
    const server = buildMcpServer(deps, config);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableDnsRebindingProtection: opts.enableDnsRebindingProtection,
      allowedHosts: opts.allowedHosts,
    });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error("MCP request failed:", err instanceof Error ? err.message : err);
      if (!res.headersSent) {
        jsonRpcError(res, 500, -32603, "Internal server error");
      }
    }
  });

  const methodNotAllowed = (_req: express.Request, res: express.Response) =>
    jsonRpcError(res, 405, -32000, "Method not allowed");
  app.get("/mcp", methodNotAllowed);
  app.delete("/mcp", methodNotAllowed);

  // express.json() throws on malformed bodies; translate to a 400.
  app.use(
    (err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
      if (
        err &&
        typeof err === "object" &&
        "type" in err &&
        (err as { type?: string }).type === "entity.parse.failed"
      ) {
        if (!res.headersSent) jsonRpcError(res, 400, -32700, "Parse error");
        return;
      }
      next(err);
    },
  );

  return app;
}
