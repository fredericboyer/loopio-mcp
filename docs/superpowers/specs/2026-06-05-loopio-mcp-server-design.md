# Loopio MCP Server: Design

Date: 2026-06-05
Status: Approved (pending implementation plan)

## Summary

A local, stdio-based Model Context Protocol (MCP) server, written in TypeScript, that exposes the Loopio API to an MCP client (Claude Desktop, Claude Code). It gives Claude task-oriented tools to search Loopio's content Library, read and draft RFP project answers, manage Library content, and pull project metadata for reporting. Writes are gated off by default; hard deletes sit behind a second, separate gate.

## Goals

- Let Claude search the Loopio Library for vetted answers.
- Let Claude read RFP project questions and draft/update responses.
- Let Claude create and update Library entries (content curation).
- Let Claude list projects and metadata for reporting and triage.
- Keep destructive and write operations off unless explicitly enabled.

## Non-goals

- No remote/hosted deployment. Local stdio only.
- No support for Confidential projects (not exposed by the Loopio API).
- No cross-project analytics engine. Reporting is covered by list/detail tools; aggregates can be added later without redesign.

## Decisions

| Topic | Decision |
|-------|----------|
| Runtime | TypeScript / Node, official `@modelcontextprotocol/sdk` |
| Transport | stdio (local) |
| Auth | OAuth 2.0 client credentials; `application/x-www-form-urlencoded`; creds via env vars |
| Scopes | Requested scopes derived from enabled tiers (least privilege at the token level) |
| Host | Single `LOOPIO_HOST` (default `api.loopio.com`); token URL and API base derive from it |
| Tool surface | Task-oriented (curated tools mapped to intent, not raw REST) |
| Write safety | Read-only by default; writes opt-in via `LOOPIO_ENABLE_WRITES` |
| Delete safety | Separate `LOOPIO_ENABLE_DELETES` flag, requires writes also on |

## Confirmed from Loopio Getting Started docs

- Token endpoint: `POST https://{host}/oauth2/access_token`, `Content-Type: application/x-www-form-urlencoded`, body `grant_type=client_credentials`, `scope` (space-delimited), `client_id`, `client_secret`.
- Token response: `{ "token_type": "Bearer", "expires_in": 3600, "access_token": "..." }`. API requests carry `Authorization: Bearer {token}`.
- Hosts are datacenter-specific and credentials are not portable across them: `api.loopio.com` (North America), `api.eu.loopio.com` (Europe, not yet accessible), `api.int01.loopio.com` (int01 testing instances). Use `api.loopio.com` unless told otherwise.
- Scopes gate endpoints. Example scopes: `library:read`, `library:write`. An endpoint requires specific scopes; the token must be requested with matching scopes; the App Client must have been created with at least those scopes. Scopes cannot be changed after app creation (delete and recreate the app to change them).

## Open items to verify against the live API

The endpoint reference (loopio.stoplight.io) is JS-rendered and could not be read during design. Confirm before wiring tools:

- Exact resource paths under the confirmed base `https://api.loopio.com/data/v2` (per-endpoint paths for library entries, stacks, categories, projects, project entries).
- Exact scope names per endpoint beyond `library:read`/`library:write`: the Project scopes (read/write) and whether delete uses a distinct scope (e.g. `library:delete`) or falls under `library:write`.
- The async search request/poll contract (job id, poll URL, terminal states).
- Pagination parameters and response envelope.
- Rate-limit headers (`Retry-After` presence) and limits.
- Whether Library entries support hard delete or only archive/deactivate. If archive-only, `delete_library_entry` becomes `archive_library_entry` with the same shape and gate.

## Architecture

Local stdio MCP server, layered so the Loopio plumbing is testable independently of MCP.

```
MCP client (Claude Desktop / Claude Code)
        |  stdio (JSON-RPC)
+-------v---------------------------------------+
| server.ts        MCP server, tool registration |
+------------------------------------------------+
| tools/           one file per domain:          |
|                  library.ts, projects.ts       |
|                  zod input schemas + handlers   |
+------------------------------------------------+
| loopio/          domain client (no MCP deps)   |
|   auth.ts        token cache + refresh          |
|   http.ts        fetch wrapper: auth header,    |
|                  429 backoff, async poll, paging|
|   library.ts     typed library calls            |
|   projects.ts    typed project calls            |
|   types.ts       shared response types          |
+------------------------------------------------+
| config.ts        env vars, write/delete flags   |
+------------------------------------------------+
```

Principles:

- The `loopio/` client has no MCP dependency. It is a plain typed SDK, unit-testable and reusable. The `tools/` layer adapts it to MCP (schemas, result formatting, error shaping).
- Write and delete tools are registered conditionally. When a flag is off, the corresponding tools are never added to the server, so Claude cannot see or call them.
- Pagination and the async request/poll search pattern are encapsulated in the domain client. Tools return complete results up to a cap; Claude never manages cursors or poll loops.

## Tool catalog

Approximately 10 tools, organized by domain. Read tools are always on. Write tools require `LOOPIO_ENABLE_WRITES`. Delete requires `LOOPIO_ENABLE_DELETES` (which itself requires writes on).

### Library: search (always on)

- `search_library`: keyword/filter search across Library entries. Handles async request/poll internally. Returns matched Q&A entries (question, answer, stack, category, last-reviewed date).
- `get_library_entry`: full detail for one entry by id.
- `list_stacks`: enumerate Library stacks for scoping searches.
- `list_categories`: enumerate Library categories for scoping searches.

### Projects: draft/answer (reads on, writes gated)

- `list_projects`: list projects with status and dates, filterable. Also serves reporting/metadata needs.
- `get_project`: project detail and sections.
- `get_project_questions`: list a project's entries (questions, current answers, assignment, status).
- `answer_project_entry` (write): set or update the response on a project entry.

### Library: content management (reads on, writes/delete gated)

- `create_library_entry` (write): add a new Q&A entry to a stack/category.
- `update_library_entry` (write): edit an existing entry's question, answer, or metadata.
- `delete_library_entry` (delete): remove a Library entry. Subject to live-API verification (hard delete vs archive).

### Reporting/metadata (always on)

Covered by `list_projects` and `get_project`. No dedicated tools at launch. Cross-project aggregates are an additive future tool, not a redesign.

## Auth, HTTP plumbing, error handling

- Token lifecycle (`auth.ts`): on first call, POST `application/x-www-form-urlencoded` client credentials plus the requested `scope` to the token endpoint. Cache `access_token` with its `expires_in`. Refresh roughly 60 seconds before expiry. Concurrent callers awaiting a refresh share one in-flight request to avoid a token stampede.
- Scope derivation (least privilege): the server computes the requested scopes from the enabled tiers, not the full set the App Client holds. Read-only mode requests only read scopes (e.g. `library:read` plus the Project read scope), so a read-only server can never obtain a write-capable token. `LOOPIO_ENABLE_WRITES` adds the write scopes; `LOOPIO_ENABLE_DELETES` adds the delete scope (if delete is a distinct scope; otherwise it folds into write). An optional `LOOPIO_SCOPES` env var overrides the derived set for cases where exact scope names differ from assumptions. If the App Client was not created with a requested scope, the token request fails fast with a clear message pointing at app setup.
- HTTP wrapper (`http.ts`): injects the bearer header. On `401`, refresh once and retry. On `429`, honor `Retry-After` or use exponential backoff, up to a small retry cap. On `5xx`, retry with backoff. A hard ceiling on total retries prevents a tool call from hanging the client.
- Async search: when a search returns the request/poll pattern (job id plus poll URL), the wrapper polls with backoff until complete or a timeout, then returns results. Claude only ever sees the final result.
- Pagination: the domain client follows pages internally up to a configurable max-results cap (default 200). If results are truncated, the tool response says so explicitly. No silent truncation.
- Error surface: tool errors return a structured, readable message (HTTP status, Loopio error body summary, originating tool and args). No raw stack traces. Auth misconfiguration (missing or invalid creds) fails fast at startup with a clear message.

## Configuration

Environment variables, read and validated at startup:

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `LOOPIO_CLIENT_ID` | yes | none | OAuth client id |
| `LOOPIO_CLIENT_SECRET` | yes | none | OAuth client secret |
| `LOOPIO_HOST` | no | `api.loopio.com` | Datacenter host; token URL and API base derive from it (`api.int01.loopio.com` for int01 testing) |
| `LOOPIO_API_BASE_PATH` | no | `/data/v2` | API base path under the host |
| `LOOPIO_SCOPES` | no | derived | Override the scopes requested in the token (else derived from the flags below) |
| `LOOPIO_ENABLE_WRITES` | no | `false` | Register create/update/answer tools; add write scopes |
| `LOOPIO_ENABLE_DELETES` | no | `false` | Register delete tool and add delete scope (ignored unless writes on) |
| `LOOPIO_MAX_RESULTS` | no | `200` | Pagination cap |

Derived URLs: token endpoint `https://{LOOPIO_HOST}/oauth2/access_token`, API base `https://{LOOPIO_HOST}{LOOPIO_API_BASE_PATH}` (default `https://api.loopio.com/data/v2`).

## Project layout

```
loopio-mcp/
  src/
    server.ts          entrypoint, stdio transport, conditional tool registration
    config.ts          env parsing + validation
    loopio/            auth.ts, http.ts, library.ts, projects.ts, types.ts
    tools/             library.ts, projects.ts  (zod schemas + handlers)
  test/                unit tests (mocked fetch)
  package.json
  tsconfig.json
  .env.example
  README.md
```

README documents registering the Loopio app, the env vars, and a sample MCP client config block.

## Testing

- Unit tests with mocked `fetch` for the `loopio/` client: token refresh/expiry, 401 retry, 429 backoff, async poll loop, pagination cap and truncation flag. These are the bug-prone parts and need no live API.
- Tool-handler tests: zod schema validation (bad inputs rejected), and that write/delete tools are absent when flags are off and present when on.
- One manual smoke check against the live API (documented in README), run with real creds, since exact endpoint contracts cannot be fully mocked until verified.
- Built test-first where it pays off (the plumbing).

## Build sequence (high level)

1. Verify the live Loopio API contracts (open items above).
2. Scaffold project, config parsing, env validation.
3. Build and test the `loopio/` client (auth, http, library, projects).
4. Build the `tools/` layer with conditional registration.
5. Wire `server.ts` to stdio transport.
6. Manual smoke test with real creds; write README.

The detailed implementation plan follows in a separate document via the writing-plans step.
