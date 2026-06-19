import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { LoopioConfig } from "./config.js";
import { buildMcpServer, type Deps } from "./app.js";
import { parsePrincipal, DEFAULT_PRINCIPAL_OPTIONS, type PrincipalOptions } from "./http-principal.js";

export interface HttpAppOptions {
  enableDnsRebindingProtection: boolean;
  allowedHosts: string[];
  /** Require and log a forwarded identity from an authenticating proxy. */
  trustProxyAuth?: boolean;
  /** Header/claim names used to read the forwarded identity. */
  principal?: PrincipalOptions;
}

function jsonRpcError(res: express.Response, status: number, code: number, message: string): void {
  res.status(status).json({ jsonrpc: "2.0", error: { code, message }, id: null });
}

/**
 * Neutralize values before they go into a log line: replace CR/LF and other
 * control characters with spaces (log-forging defense), collapse runs, and cap
 * length.
 */
function sanitizeLog(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    out += code < 0x20 || code === 0x7f ? " " : s[i];
  }
  return out.replace(/\s+/g, " ").trim().slice(0, 256);
}

/** Best-effort method/tool label from a JSON-RPC body, for audit logging. */
function describeRequest(body: unknown): string {
  if (!body || typeof body !== "object") return "?";
  const b = body as { method?: unknown; params?: { name?: unknown } };
  const method = typeof b.method === "string" ? sanitizeLog(b.method) : "?";
  const tool = typeof b.params?.name === "string" ? ` tool=${sanitizeLog(b.params.name)}` : "";
  return `${method}${tool}`;
}

export function createHttpApp(
  deps: Deps,
  config: LoopioConfig,
  opts: HttpAppOptions,
): express.Express {
  const app = express();
  if (opts.trustProxyAuth) {
    // Behind a reverse proxy: trust X-Forwarded-* so req.ip reflects the client.
    app.set("trust proxy", 1);
  }
  app.use(express.json());

  app.get("/healthz", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  const principalOpts = opts.principal ?? DEFAULT_PRINCIPAL_OPTIONS;
  const requireIdentity: express.RequestHandler = (req, res, next) => {
    const principal = parsePrincipal(req.headers, principalOpts);
    if (!principal) {
      // Proxy-auth is on but no verified identity arrived: refuse rather than
      // fall through to anonymous (guards against a proxy bypass).
      jsonRpcError(res, 401, -32001, "Unauthorized: missing or invalid proxy identity");
      return;
    }
    console.error(
      `mcp request user=${sanitizeLog(principal.name)} ip=${req.ip} ${describeRequest(req.body)}`,
    );
    next();
  };

  const mcpHandler: express.RequestHandler = async (req, res) => {
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
  };

  if (opts.trustProxyAuth) {
    app.post("/mcp", requireIdentity, mcpHandler);
  } else {
    app.post("/mcp", mcpHandler);
  }

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
