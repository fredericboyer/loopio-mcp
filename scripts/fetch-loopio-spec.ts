#!/usr/bin/env node
/**
 * Pulls the latest Loopio OpenAPI spec from Stoplight's public export endpoint
 * and vendors it to specs/loopio-openapi.yaml.
 *
 * This is the as-authored spec (internal `#/components` $refs intact, no external
 * file refs), which gives clean `git diff`s and is fully resolvable by
 * openapi-typescript. Add `&deref=optimizedBundle` to the URL for a flattened,
 * self-contained variant instead.
 *
 * Run: npm run spec:fetch   (or  npm run spec:update  to also regenerate types)
 */
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const SPEC_URL =
  "https://stoplight.io/api/v1/projects/loopio/loopio-api/nodes/openapi.yaml" +
  "?fromExportButton=true&snapshotType=http_service";

const OUT_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "specs",
  "loopio-openapi.yaml",
);

/**
 * Guard against silently overwriting the vendored spec with an error page or a
 * truncated body. Stoplight returns JSON like {"message":"Not found"} on a bad
 * slug and could serve an HTML/proxy error; either would sail through a naive
 * write and only surface much later as broken codegen. Reject anything that
 * doesn't read like a non-trivial OpenAPI YAML document.
 */
function looksLikeOpenApiYaml(body: string): boolean {
  return body.length > 10_000 && /^openapi:\s*3\./m.test(body) && /^paths:/m.test(body);
}

async function main(): Promise<void> {
  process.stdout.write(`Fetching Loopio OpenAPI spec...\n  ${SPEC_URL}\n`);
  const res = await fetch(SPEC_URL);
  if (!res.ok) {
    throw new Error(`Download failed: HTTP ${res.status} ${res.statusText}`);
  }
  const body = await res.text();
  if (!looksLikeOpenApiYaml(body)) {
    throw new Error(
      `Response did not look like an OpenAPI spec (${body.length} bytes). ` +
        `Refusing to overwrite ${OUT_PATH}.\nFirst 200 chars:\n${body.slice(0, 200)}`,
    );
  }
  await mkdir(dirname(OUT_PATH), { recursive: true });
  await writeFile(OUT_PATH, body, "utf8");
  process.stdout.write(`Wrote ${body.length} bytes to ${OUT_PATH}\n`);
}

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
