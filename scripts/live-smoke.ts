/**
 * Live read-only smoke test for loopio-mcp.
 *
 * Exercises the real Loopio Data API with your credentials to confirm auth,
 * scopes, and basic read endpoints work end to end. READ-ONLY: it never
 * creates, updates, or deletes anything.
 *
 * Usage (PowerShell):
 *   $env:LOOPIO_CLIENT_ID="<real>"; $env:LOOPIO_CLIENT_SECRET="<real>"
 *   npx tsx scripts/live-smoke.ts [searchQuery]
 *
 * Optional env: LOOPIO_HOST, LOOPIO_MAX_RESULTS (see .env.example).
 */
import { loadConfig } from "../src/config.js";
import { TokenManager } from "../src/loopio/auth.js";
import { LoopioHttpClient } from "../src/loopio/http.js";
import { LibraryApi } from "../src/loopio/library.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const tokens = new TokenManager(config);
  const http = new LoopioHttpClient(config, tokens);
  const library = new LibraryApi(http, config.maxResults);

  const query = process.argv[2] ?? "security";

  console.log(`loopio live smoke (read-only) against ${config.apiBaseUrl}`);

  console.log("\n[1/2] get_library_structure ...");
  const structure = await library.getLibraryStructure();
  const stackCount = Array.isArray(structure)
    ? structure.length
    : Array.isArray((structure as { items?: unknown[] } | null)?.items)
      ? (structure as { items: unknown[] }).items.length
      : "unknown";
  console.log(`  ok: received library structure (top-level stacks: ${stackCount})`);

  console.log(`\n[2/2] search_library { searchQuery: ${JSON.stringify(query)} } ...`);
  const results = await library.searchLibrary({ searchQuery: query });
  console.log(
    `  ok: ${results.items.length} returned of ${results.totalItems} total` +
      (results.truncated ? " (truncated at max-results)" : ""),
  );

  console.log("\nLive smoke passed. Auth, scopes, and read endpoints are working.");
}

main().catch((err) => {
  console.error("Live smoke failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
