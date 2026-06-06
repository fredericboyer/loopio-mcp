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

## Confirmed against the live Loopio API spec

Verified by reading the Loopio OpenAPI definition (Stoplight, project `loopio-api`, v1.0.0).

Auth and hosts:

- Token endpoint: `POST https://{host}/oauth2/access_token`, `Content-Type: application/x-www-form-urlencoded`, body `grant_type=client_credentials`, `scope` (space-delimited), `client_id`, `client_secret`.
- Token response: `{ "token_type": "Bearer", "expires_in": 3600, "access_token": "..." }`. API requests carry `Authorization: Bearer {token}`.
- OAuth security scheme is named `loopio_auth` (OAuth2, `clientCredentials` flow, token URL `/oauth2/access_token`).
- Hosts (datacenter-specific, credentials not portable): `api.loopio.com` (North America, base `/data/v2`), `api.eu.loopio.com` (Europe, base `/data/v2`, not yet accessible), `api.int01.loopio.com` (int01 testing). A Stoplight mock server also exists at `https://stoplight.io/mocks/loopio/loopio-api/84330`.

Scopes (verified, granular):

- `library:read`, `library:write`, `library:delete`, `project:read`, `project:write`.
- An endpoint requires specific scopes; the token must be requested with matching scopes; the App Client must be created with at least those scopes. Scopes cannot be changed after app creation (delete and recreate to change them).

Conventions:

- Pagination: `page` and `pageSize` query parameters.
- Async: long-running operations enqueue a task; poll `GET /asyncTasks/{taskId}` for status.
- `inline[]` query parameter on several reads expands related data (e.g. `@mergeVariables`).
- Errors use a documented `Error` schema. Library update is JSON Patch (`PATCH`). Project entry answer is a full `PUT`.

### Tool-to-endpoint map (verified)

| Tool | Method + path | Scope |
|------|---------------|-------|
| `search_library` | `GET /libraryEntries` (`filter`, `page`, `pageSize`) | `library:read` |
| `get_library_entry` | `GET /libraryEntries/{id}` (`inline[]`) | `library:read` |
| `get_library_structure` | `GET /stacks` (`fields`) returns stacks + categories + subcategories | `library:read` |
| `list_projects` | `GET /projects` (`rfxTypes`, `owners`, `page`, `pageSize`) | `project:read` |
| `get_project` | `GET /projects/{id}` (`fields`) | `project:read` |
| `get_project_questions` | `GET /projectEntries` (`projectId`, `sectionId`, `subSectionId`, `inline[]`, `page`, `pageSize`) | `project:read` |
| `get_project_status_summary` | `GET /projects/summary` (`lastUpdatedDateGt`) | `project:read` |
| `answer_project_entry` (write) | `PUT /projectEntries/{id}` (`inline[]`) | `project:write` |
| `create_library_entry` (write) | `POST /libraryEntries` | `library:write` |
| `update_library_entry` (write) | `PATCH /libraryEntries/{id}` (JSON Patch) | `library:write` |
| `delete_library_entry` (delete) | `DELETE /libraryEntries/{id}` | `library:delete` |

The broader Loopio API (~60 operations: Users, Teams, Webhooks, Merge Variables, Custom Project Fields, Project Sections/SubSections, Compliance Sets, Project Templates, CRM, Roles, Files, bulk Library import) is intentionally out of scope. Each is an additive future tool, not a redesign.

## Remaining items to confirm during implementation

- Exact `filter` syntax for `GET /libraryEntries` (documented in the `LibrarySearchOptions` model; pull from the spec when building `search_library`).
- Pagination response envelope (whether total counts / next markers are returned) and whether `GET /libraryEntries` ever enqueues an async task for large result sets.
- Rate-limit headers (`Retry-After` presence) and documented limits.
- Exact request body shape for `create_library_entry` and `update_library_entry` (from the `LibraryEntry` / `JsonPatch` models).

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

Eleven tools, organized by domain (see the verified tool-to-endpoint map above for paths and scopes). Read tools are always on. Write tools require `LOOPIO_ENABLE_WRITES`. Delete requires `LOOPIO_ENABLE_DELETES` (which itself requires writes on).

### Library: search (always on)

- `search_library`: keyword/filter search across Library entries via `GET /libraryEntries`. Follows pagination internally up to the max-results cap. Returns matched Q&A entries (question, answer, stack/category location, status, last-reviewed date).
- `get_library_entry`: full detail for one entry by id, optionally expanding merge variables via `inline[]`.
- `get_library_structure`: the full Library structure (stacks, categories, subcategories) from `GET /stacks`, for scoping searches and for resolving location ids when creating entries.

### Projects: draft/answer (reads on, writes gated)

- `list_projects`: list projects, filterable by RFx type and owners.
- `get_project`: project detail.
- `get_project_questions`: list a project's entries (questions, current answers, assignment, status), filterable by section/subsection.
- `answer_project_entry` (write): set or update the response on a project entry via `PUT /projectEntries/{id}`.

### Library: content management (reads on, writes/delete gated)

- `create_library_entry` (write): add a new Q&A entry to a stack/category.
- `update_library_entry` (write): edit an existing entry via JSON Patch (`PATCH /libraryEntries/{id}`).
- `delete_library_entry` (delete): hard-delete a Library entry (`DELETE /libraryEntries/{id}`, scope `library:delete`).

### Reporting/metadata (always on)

- `get_project_status_summary`: project status summaries via `GET /projects/summary`, filterable by `lastUpdatedDateGt` for sync/triage workflows. Together with `list_projects` this covers reporting without a separate analytics layer.

## Auth, HTTP plumbing, error handling

- Token lifecycle (`auth.ts`): on first call, POST `application/x-www-form-urlencoded` client credentials plus the requested `scope` to the token endpoint. Cache `access_token` with its `expires_in`. Refresh roughly 60 seconds before expiry. Concurrent callers awaiting a refresh share one in-flight request to avoid a token stampede.
- Scope derivation (least privilege): the server computes the requested scopes from the enabled tiers, not the full set the App Client holds.
  - Read-only (default): `library:read project:read`.
  - `LOOPIO_ENABLE_WRITES` adds: `library:write project:write`.
  - `LOOPIO_ENABLE_DELETES` adds: `library:delete`.
  A read-only server can never obtain a write-capable token. An optional `LOOPIO_SCOPES` env var overrides the derived set. If the App Client was not created with a requested scope, the token request fails fast with a clear message pointing at app setup.
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
- Optional integration check against the Loopio Stoplight mock server (`https://stoplight.io/mocks/loopio/loopio-api/84330`) by pointing `LOOPIO_HOST`/base at the mock, exercising real request/response shapes without real creds or production data.
- One manual smoke check against the live API (documented in README), run with real creds.
- Built test-first where it pays off (the plumbing).

## Build sequence (high level)

1. Pull the remaining model details (`LibrarySearchOptions` filter syntax, `LibraryEntry`/`JsonPatch` request bodies, pagination envelope) from the Stoplight spec.
2. Scaffold project, config parsing, env validation.
3. Build and test the `loopio/` client (auth, http, library, projects).
4. Build the `tools/` layer with conditional registration.
5. Wire `server.ts` to stdio transport.
6. Manual smoke test with real creds; write README.

The detailed implementation plan follows in a separate document via the writing-plans step.
