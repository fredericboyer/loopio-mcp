# loopio-mcp

A local [MCP](https://modelcontextprotocol.io) server exposing the Loopio Data API (v2) to MCP clients (Claude Desktop, Claude Code). Read-only by default; writes and deletes are opt-in.

> **Unofficial.** This is an independent, community-built project. It is not affiliated with, endorsed by, or supported by Loopio Inc. "Loopio" is a trademark of its respective owner and is used here only to identify the API this server targets. Use of the Loopio API is subject to Loopio's own terms.

## Tools

Read (always on): `search_library`, `get_library_entry`, `get_library_structure`, `list_projects`, `get_project`, `get_project_questions`, `get_project_status_summary`.

Write (require `LOOPIO_ENABLE_WRITES=true`): `create_library_entry`, `update_library_entry`, `answer_project_entry`.

Delete (require `LOOPIO_ENABLE_WRITES=true` and `LOOPIO_ENABLE_DELETES=true`): `delete_library_entry`.

## Setup

In Loopio, sign in as an Admin and go to **Admin > Integrations > For Developers > Add an App**. Select the scopes you need (`library:read`, `project:read`, and optionally `library:write`, `project:write`, `library:delete`). Scopes cannot be changed after creation, so select every scope you might enable. Copy the Client ID and Secret (the secret is shown only once).

## MCP client configuration

Add the server to your MCP client (Claude Desktop, Claude Code). Run it directly with `npx` (no checkout needed), or build from source.

### With npx (recommended)

Requires the package to be published to npm.

```json
{
  "mcpServers": {
    "loopio-mcp": {
      "command": "npx",
      "args": ["-y", "loopio-mcp"],
      "env": {
        "LOOPIO_CLIENT_ID": "your-client-id",
        "LOOPIO_CLIENT_SECRET": "your-client-secret",
        "LOOPIO_ENABLE_WRITES": "false"
      }
    }
  }
}
```

### From source

```bash
git clone https://github.com/fredericboyer/loopio-mcp
cd loopio-mcp
npm install && npm run build
```

Then point your client at the built entry file, using an absolute path:

```json
{
  "mcpServers": {
    "loopio-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/loopio-mcp/dist/server.js"],
      "env": {
        "LOOPIO_CLIENT_ID": "your-client-id",
        "LOOPIO_CLIENT_SECRET": "your-client-secret",
        "LOOPIO_ENABLE_WRITES": "false"
      }
    }
  }
}
```

### Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `LOOPIO_CLIENT_ID` | Yes | — | OAuth2 client id from the Loopio app. |
| `LOOPIO_CLIENT_SECRET` | Yes | — | OAuth2 client secret (shown only once at app creation). |
| `LOOPIO_ENABLE_WRITES` | No | `false` | Enable the write tools (`create_library_entry`, `update_library_entry`, `answer_project_entry`). |
| `LOOPIO_ENABLE_DELETES` | No | `false` | Enable the delete tool (`delete_library_entry`). Ignored unless `LOOPIO_ENABLE_WRITES` is also `true`. |
| `LOOPIO_HOST` | No | `api.loopio.com` | API host. Use `api.int01.loopio.com` for Loopio's test environment. |
| `LOOPIO_API_BASE_PATH` | No | `/data/v2` | API base path. |
| `LOOPIO_SCOPES` | No | derived from the flags above | Space-delimited override of the requested OAuth scopes. |
| `LOOPIO_MAX_RESULTS` | No | `200` | Maximum items returned per list/search tool (must be a positive integer). |

The server requests only the OAuth scopes matching the enabled tiers, so a read-only deployment never holds write or delete scopes.

## Testing against the mock server

You can exercise the tools without real credentials by pointing the base URL at Loopio's Stoplight mock:

```powershell
$env:LOOPIO_CLIENT_ID="mock"; $env:LOOPIO_CLIENT_SECRET="mock"
$env:LOOPIO_API_BASE_PATH="/loopio/loopio-api/84330"; $env:LOOPIO_HOST="stoplight.io"
```

Note: the mock does not implement OAuth, so this only exercises request/response shapes for endpoints that the mock serves. Use the live API for end-to-end verification.

## Live smoke test (read-only)

With real credentials you can verify end-to-end auth and read access without writing anything:

```powershell
$env:LOOPIO_CLIENT_ID="<real>"; $env:LOOPIO_CLIENT_SECRET="<real>"
npx tsx scripts/live-smoke.ts "security"
```

This calls `get_library_structure` and `search_library` and prints a short summary. It never creates, updates, or deletes data. A non-zero exit with a clear message indicates an auth, scope, or configuration problem.

## Development

- `npm test` runs the unit tests.
- `npm run dev` runs the server from source via tsx.
