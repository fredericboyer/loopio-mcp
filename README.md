# loopio-mcp

A local [MCP](https://modelcontextprotocol.io) server exposing the Loopio Data API (v2) to MCP clients (Claude Desktop, Claude Code). Read-only by default; writes and deletes are opt-in.

## Tools

Read (always on): `search_library`, `get_library_entry`, `get_library_structure`, `list_projects`, `get_project`, `get_project_questions`, `get_project_status_summary`.

Write (require `LOOPIO_ENABLE_WRITES=true`): `create_library_entry`, `update_library_entry`, `answer_project_entry`.

Delete (require `LOOPIO_ENABLE_WRITES=true` and `LOOPIO_ENABLE_DELETES=true`): `delete_library_entry`.

## Setup

1. In Loopio, sign in as an Admin and go to **Admin > Integrations > For Developers > Add an App**. Select the scopes you need (`library:read`, `project:read`, and optionally `library:write`, `project:write`, `library:delete`). Scopes cannot be changed after creation, so select every scope you might enable. Copy the Client ID and Secret (the secret is shown only once).
2. `npm install && npm run build`
3. Configure your MCP client (below).

## MCP client configuration

```json
{
  "mcpServers": {
    "loopio-mcp": {
      "command": "node",
      "args": ["C:/Projects/loopio-mcp/dist/server.js"],
      "env": {
        "LOOPIO_CLIENT_ID": "your-client-id",
        "LOOPIO_CLIENT_SECRET": "your-client-secret",
        "LOOPIO_ENABLE_WRITES": "false"
      }
    }
  }
}
```

To enable writes, set `LOOPIO_ENABLE_WRITES` to `true` (and `LOOPIO_ENABLE_DELETES` to `true` to also allow deletes). The server requests only the scopes matching the enabled tiers.

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
