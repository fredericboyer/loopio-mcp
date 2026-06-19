#!/usr/bin/env node
import { loadConfig, loadHttpConfig, exposureWarning } from "./config.js";
import { createDeps } from "./app.js";
import { createHttpApp } from "./http-app.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const httpConfig = loadHttpConfig();
  const deps = createDeps(config);

  const app = createHttpApp(deps, config, {
    enableDnsRebindingProtection: true,
    allowedHosts: httpConfig.allowedHosts,
    trustProxyAuth: httpConfig.trustProxyAuth,
    principal: httpConfig.principal,
  });

  const mode = config.readOnly ? "read-only" : "writes+deletes";

  // Surface the risk when the endpoint is reachable and unauthenticated.
  const warning = exposureWarning(config, httpConfig);
  if (warning) console.error(warning);

  const server = app.listen(httpConfig.port, httpConfig.host, () => {
    // stderr keeps stdout clean; HTTP transport does not use stdout for protocol.
    const auth = httpConfig.trustProxyAuth ? "proxy-auth" : "no-auth";
    console.error(
      `loopio-mcp HTTP listening on ${httpConfig.host}:${httpConfig.port} (${mode}, ${auth}); host=${config.host}`,
    );
  });

  const shutdown = (signal: string) => {
    console.error(`loopio-mcp HTTP received ${signal}, shutting down`);
    server.close(() => process.exit(0));
    // Container hygiene: if keep-alive connections keep the server open past the
    // grace window, force exit. unref() so this timer never blocks a clean exit.
    setTimeout(() => process.exit(1), 5_000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err) => {
  console.error("loopio-mcp HTTP failed to start:", err instanceof Error ? err.message : err);
  process.exit(1);
});
