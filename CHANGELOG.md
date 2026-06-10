# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/fredericboyer/loopio-mcp/compare/v0.2.1...HEAD
[0.2.1]: https://github.com/fredericboyer/loopio-mcp/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/fredericboyer/loopio-mcp/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/fredericboyer/loopio-mcp/releases/tag/v0.1.0
