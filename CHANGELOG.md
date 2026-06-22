# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.4.0] - 2026-06-22

### Added

- Every tool now advertises a human-friendly display title (e.g. "Search
  Loopio Library", "Get Loopio Library Structure") and MCP behaviour
  annotations (`readOnlyHint`, `destructiveHint`) derived from its access
  tier. Clients such as the Claude connector UI use these to show readable
  tool names and to split the tools into "Read-only" and "Write/delete"
  groups, with the delete tool flagged as destructive for a stronger approval
  prompt. The annotations are advisory display/consent hints only; actual tool
  exposure is still gated server-side by `LOOPIO_READ_ONLY`.

## [0.3.1] - 2026-06-19

### Security

- Hardened the proxy-auth audit log against log injection: each
  attacker-influenced field (forwarded identity name, client IP, request
  method/tool) is now stripped of CR/LF and length-bounded individually before
  logging, so a forwarded value can neither forge new log lines nor push the
  fixed audit fields off a truncated record. Clears CodeQL `js/log-injection`.
- Overrode the transitive `js-yaml` dependency to 4.2.0 (pulled in via the
  `openapi-typescript` dev toolchain), clearing the last two moderate
  advisories. `npm audit` now reports no known vulnerabilities.

## [0.3.0] - 2026-06-18

### Added

- HTTP transport proxy-auth mode (`LOOPIO_TRUST_PROXY_AUTH=true`): the server
  requires a forwarded identity from an authenticating reverse proxy on
  `POST /mcp` (rejecting requests without one with `401`) and logs that
  identity per request for audit. Identity headers/claims are configurable
  (`LOOPIO_AUTH_PRINCIPAL_HEADER`, `LOOPIO_AUTH_NAME_HEADER`,
  `LOOPIO_AUTH_NAME_CLAIM`, `LOOPIO_AUTH_ROLES_CLAIM`) and default to Azure App
  Service "Easy Auth", enabling deployment as a Claude Enterprise custom remote
  connector behind Microsoft Entra. See the new README deployment section.
- HTTP port now falls back to the `PORT` environment variable (injected by
  Azure App Service) when `LOOPIO_HTTP_PORT` is unset.
- Startup warning when the HTTP server binds to a non-loopback address without
  proxy-auth (it is then reachable and unauthenticated). Previously this only
  fired when write tools were also enabled; it now fires for read-only too,
  with an extra blast-radius note when writes are on.
- A Claude Code plugin (`/plugin marketplace add fredericboyer/loopio-mcp`,
  then `/plugin install loopio@loopio-mcp`) that installs the MCP server
  config and a Loopio skill covering RFP answering, library search, and
  curation workflows. The skill also works standalone: copy
  `plugin/skills/loopio/` into `~/.claude/skills/`. The plugin ships from
  the repo and is versioned independently of the npm package.

### Changed

- **BREAKING:** write/delete gating is now a single switch. `LOOPIO_ENABLE_WRITES`
  and `LOOPIO_ENABLE_DELETES` are removed and replaced by `LOOPIO_READ_ONLY`.
  The default is now **read-write** (write and delete tools enabled); set
  `LOOPIO_READ_ONLY=true` to restrict the server to read tools only. Hosted
  deployments should set `LOOPIO_READ_ONLY=true` as a blast-radius control.
- CI: merging a release PR to `main` now automatically creates the GitHub
  Release (tag plus notes extracted from this file) and runs the npm staging
  and Docker GHCR publishes in the same pipeline; manually published releases
  still publish as a fallback. The Docker workflow now only builds on PRs.
- Updated development dependencies to current versions (oxfmt, oxlint, vitest,
  `@types/node`, esbuild).

### Security

- Patched the transitive `hono` dependency (pulled in via
  `@modelcontextprotocol/sdk`) to 4.12.26, clearing a high-severity advisory.
  Production dependencies report no known vulnerabilities. The affected `hono`
  features (serve-static, Lambda adapters, Hono CORS) are not used by this
  server, which runs over Express.

## [0.2.1] - 2026-06-09

### Fixed

- A 401 from the Loopio API now invalidates the cached OAuth token before the
  single retry, so the retry carries a freshly fetched token. Previously the
  retry re-sent the same cached token, making the retry a no-op (e.g. after a
  credential rotation, calls kept failing until the cached token expired).
- The OAuth token response is now validated; a malformed response fails loudly
  instead of silently degrading into refetching the token on every request.
- `Retry-After` values from the API are clamped to 30 seconds (negative values
  fall back to exponential backoff), so a pathological header can no longer
  block a tool call for an arbitrary time.

### Changed

- All outbound requests (token and API) now carry a 30-second timeout, so a
  hung endpoint can no longer block an MCP tool call indefinitely.
- Tool handler argument types are now inferred from their zod schemas
  (internal refactor; tool names, descriptions, and schemas are unchanged).
- CI: manual `workflow_dispatch` of the release workflow now performs a
  `npm publish --dry-run` rehearsal instead of staging; staging only happens
  for real releases. The Docker workflow grants `packages: write` only to the
  release-time publish job; PR builds run with a read-only token.

## [0.2.0] - 2026-06-09

### Added

- Hosted **Streamable HTTP** transport, exposed as a second binary,
  `loopio-mcp-http`, alongside the existing stdio server. It is a stateless
  Express server serving the MCP endpoint at `POST /mcp` and a health probe at
  `GET /healthz`, configured via `LOOPIO_HTTP_PORT` (default `3000`),
  `LOOPIO_HTTP_HOST` (default `0.0.0.0`), and `LOOPIO_HTTP_ALLOWED_HOSTS`. The
  HTTP server is unauthenticated by design and is meant to run behind an
  authenticating reverse proxy.
- Distroless Docker image published to `ghcr.io/fredericboyer/loopio-mcp` on each
  release (tagged with the version, `MAJOR.MINOR`, and `latest`). It runs the
  HTTP server as a non-root user.

### Changed

- Standardized on Node 24 (current LTS): `engines.node` now requires `>=24`, and
  CI runs on Node 24.

## [0.1.0] - 2026-06-07

Initial release. Unofficial MCP (stdio) server for the Loopio Data API v2. Not
affiliated with or endorsed by Loopio Inc.

### Added

- Eleven tools across the Library and Projects domains, read-only by default
  with writes and deletes opt-in:
  - Read: `search_library`, `get_library_entry`, `get_library_structure`,
    `list_projects`, `get_project`, `get_project_questions`,
    `get_project_status_summary`.
  - Write (requires `LOOPIO_ENABLE_WRITES`): `create_library_entry`,
    `update_library_entry`, `answer_project_entry`.
  - Delete (requires `LOOPIO_ENABLE_WRITES` and `LOOPIO_ENABLE_DELETES`):
    `delete_library_entry`.
- OAuth2 client-credentials auth with least-privilege scope derivation (scopes
  requested match the enabled tiers), refresh-on-401, and 429 `Retry-After`
  handling.
- Tiered safety gating: tools whose tier is disabled are never registered.
- Internal pagination with a configurable `LOOPIO_MAX_RESULTS` cap and a
  `truncated` flag on capped results.
- OpenAPI spec pipeline: `npm run spec:update` fetches the live Loopio spec and
  regenerates `src/loopio/openapi.generated.ts`. Curated input types are derived
  from the generated OpenAPI types so they cannot drift from the API.
- Configuration via environment variables, documented in the README.
- Tooling: `oxlint` and `oxfmt` (`lint` / `format` / `format:check`), and a
  vitest suite (48 tests).

[Unreleased]: https://github.com/fredericboyer/loopio-mcp/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/fredericboyer/loopio-mcp/compare/v0.3.1...v0.4.0
[0.3.1]: https://github.com/fredericboyer/loopio-mcp/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/fredericboyer/loopio-mcp/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/fredericboyer/loopio-mcp/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/fredericboyer/loopio-mcp/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/fredericboyer/loopio-mcp/releases/tag/v0.1.0
