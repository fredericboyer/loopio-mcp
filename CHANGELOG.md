# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/fredericboyer/loopio-mcp/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/fredericboyer/loopio-mcp/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/fredericboyer/loopio-mcp/releases/tag/v0.1.0
