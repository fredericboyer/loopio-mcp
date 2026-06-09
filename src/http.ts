#!/usr/bin/env node
import { loadConfig, loadHttpConfig } from "./config.js";
import { createDeps } from "./app.js";
import { createHttpApp } from "./http-app.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const httpConfig = loadHttpConfig();
  const deps = createDeps(config);

  const app = createHttpApp(deps, config, {
    enableDnsRebindingProtection: true,
    allowedHosts: httpConfig.allowedHosts,
  });

  const mode = config.enableDeletes
    ? "writes+deletes"
    : config.enableWrites
      ? "writes"
      : "read-only";

  // This server is unauthenticated and meant to sit behind an auth proxy. A
  // mutating tier (writes, or writes+deletes) on a non-loopback bind means a
  // misconfigured exposure could change or delete Loopio data. enableDeletes
  // implies enableWrites, so this condition covers both.
  if (config.enableWrites && httpConfig.host !== "127.0.0.1" && httpConfig.host !== "localhost") {
    console.error(
      `WARNING: ${mode} enabled and bound to ${httpConfig.host} (not loopback). ` +
        "This server does not authenticate requests; ensure an auth proxy fronts it.",
    );
  }

  const server = app.listen(httpConfig.port, httpConfig.host, () => {
    // stderr keeps stdout clean; HTTP transport does not use stdout for protocol.
    console.error(
      `loopio-mcp HTTP listening on ${httpConfig.host}:${httpConfig.port} (${mode}); host=${config.host}`,
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
