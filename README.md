# loopio-mcp

A local [MCP](https://modelcontextprotocol.io) server exposing the Loopio Data API (v2) to MCP clients (Claude Desktop, Claude Code). Read, write, and delete tools are enabled by default; set `LOOPIO_READ_ONLY=true` to restrict it to read-only.

> **Unofficial.** This is an independent, community-built project. It is not affiliated with, endorsed by, or supported by Loopio Inc. "Loopio" is a trademark of its respective owner and is used here only to identify the API this server targets. Use of the Loopio API is subject to Loopio's own terms.

## Tools

Read (always on): `search_library`, `get_library_entry`, `get_library_structure`, `list_projects`, `get_project`, `get_project_questions`, `get_project_status_summary`.

Write (hidden when `LOOPIO_READ_ONLY=true`): `create_library_entry`, `update_library_entry`, `answer_project_entry`.

Delete (hidden when `LOOPIO_READ_ONLY=true`): `delete_library_entry`.

## Setup

In Loopio, sign in as an Admin and go to **Admin > Integrations > For Developers > Add an App**. Select the scopes you need (`library:read`, `project:read`, and optionally `library:write`, `project:write`, `library:delete`). Scopes cannot be changed after creation, so select every scope you might enable. Copy the Client ID and Secret (the secret is shown only once).

## Claude Code

### Plugin (recommended)

Installs the MCP server config and a Loopio skill (RFP answering, library
search, curation workflows) in one step:

```
/plugin marketplace add fredericboyer/loopio-mcp
/plugin install loopio@loopio-mcp
```

Set `LOOPIO_CLIENT_ID` and `LOOPIO_CLIENT_SECRET` in your environment (the
plugin's server config reads them via env-var expansion). Write and delete
tools are enabled by default; set `LOOPIO_READ_ONLY=true` in your environment
to restrict the server to read-only.

Try prompts like:

- "Answer this security questionnaire question from our Loopio library: …"
- "Which Loopio library entries haven't been updated in over a year?"
- "Summarize the status of our open RFP projects."

### Standalone skill (no plugin)

If you configured the MCP server manually (or use Claude Desktop for the
server), you can install just the skill: copy `plugin/skills/loopio/` into
`~/.claude/skills/` (user-wide) or `.claude/skills/` in a project. The skill
only assumes the `loopio-mcp` tools exist, regardless of how the server was
configured.

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
        "LOOPIO_READ_ONLY": "false"
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
        "LOOPIO_READ_ONLY": "false"
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
| `LOOPIO_READ_ONLY` | No | `false` | When `true`, expose only the read tools (hides all write and delete tools). The default exposes write **and** delete tools. |
| `LOOPIO_HOST` | No | `api.loopio.com` | API host. Use `api.int01.loopio.com` for Loopio's test environment. |
| `LOOPIO_API_BASE_PATH` | No | `/data/v2` | API base path. |
| `LOOPIO_SCOPES` | No | derived from the flag above | Space-delimited override of the requested OAuth scopes. |
| `LOOPIO_MAX_RESULTS` | No | `200` | Maximum items returned per list/search tool (must be a positive integer). |

The server requests only the OAuth scopes matching the enabled tiers, so a read-only deployment never holds write or delete scopes.

## HTTP transport (`loopio-mcp-http`)

In addition to the stdio server (`loopio-mcp`), this package ships a second binary, `loopio-mcp-http`, that serves the MCP **Streamable HTTP** protocol. It exposes:

- `POST /mcp`: the MCP endpoint.
- `GET /healthz`: liveness probe (returns `200 OK`).

The server is stateless. By default it does not authenticate requests and is meant to sit behind an auth proxy (see the security note below). It can optionally **trust an authenticating proxy** and require a forwarded identity — see `LOOPIO_TRUST_PROXY_AUTH` and the Entra deployment section.

### Running the HTTP server

```powershell
$env:LOOPIO_CLIENT_ID="your-client-id"; $env:LOOPIO_CLIENT_SECRET="your-client-secret"
# loopio-mcp-http is a bin inside the loopio-mcp package, so name the package explicitly:
npx --package loopio-mcp loopio-mcp-http
```

(If `loopio-mcp` is installed globally, run `loopio-mcp-http` directly.)

Or from source after building:

```bash
node dist/http.js
```

### HTTP environment variables

The following variables are specific to the HTTP transport. All existing Loopio variables (`LOOPIO_CLIENT_ID`, `LOOPIO_CLIENT_SECRET`, `LOOPIO_READ_ONLY`, `LOOPIO_MAX_RESULTS`, etc.) apply to both transports unchanged.

| Variable | Default | Description |
|----------|---------|-------------|
| `LOOPIO_HTTP_PORT` | `3000` | TCP port to listen on. If unset, falls back to `PORT` (which Azure App Service injects), then `3000`. |
| `LOOPIO_HTTP_HOST` | `0.0.0.0` | Bind address. The default is suitable for containers; use `127.0.0.1` to restrict to loopback. |
| `LOOPIO_HTTP_ALLOWED_HOSTS` | `127.0.0.1:<port>,localhost:<port>` | Comma-separated list of `Host` header values the server will accept. Guards against DNS-rebinding. **Set this to your public hostname when deployed** (e.g., `my-app.azurewebsites.net`) or every request is rejected. |
| `LOOPIO_TRUST_PROXY_AUTH` | `false` | When `true`, trust a fronting auth proxy: require a forwarded identity on `POST /mcp` (reject with `401` if absent), log it for audit, and trust `X-Forwarded-*`. The identity header is **trusted, not cryptographically verified** — only safe when the proxy strips inbound copies of it and is the sole network path (see Security). Leave `false` for local/no-auth use. |
| `LOOPIO_AUTH_PRINCIPAL_HEADER` | `x-ms-client-principal` | Header carrying base64-JSON identity claims. Default targets Azure Easy Auth; override for other gateways. |
| `LOOPIO_AUTH_NAME_HEADER` | `x-ms-client-principal-name` | Header carrying the identity display name directly. |
| `LOOPIO_AUTH_NAME_CLAIM` | `name` | Claim type holding the display name inside the encoded principal. |
| `LOOPIO_AUTH_ROLES_CLAIM` | `roles` | Claim type holding role/group values inside the encoded principal. |

### Security

By default `loopio-mcp-http` does not authenticate requests. It is designed to run behind an authenticating reverse proxy or gateway that you operate, which terminates auth before traffic reaches the server. With `LOOPIO_TRUST_PROXY_AUTH=true` it additionally enforces that such a proxy is present, rejecting any request that arrives without a forwarded identity.

**Do not expose the port directly to untrusted networks.** Anyone who can reach it drives the shared Loopio service identity (the OAuth credentials the server holds). Because every user shares one Loopio credential, Loopio's own logs cannot tell users apart — in proxy-auth mode the server logs the forwarded identity per request so you retain a per-user audit trail.

Practical guidance:

- As a blast-radius control, set `LOOPIO_READ_ONLY=true` on hosted deployments unless they specifically need write access.
- Any authenticating proxy works as the auth layer: oauth2-proxy, NGINX or Envoy with OIDC, Azure Container Apps or App Service built-in authentication, Azure API Management, Entra Application Proxy, or similar. Set `LOOPIO_TRUST_PROXY_AUTH=true` so the server fails closed if the proxy is ever bypassed.

> **Proxy-auth trusts, it does not verify.** In `LOOPIO_TRUST_PROXY_AUTH=true` mode the server reads the caller's identity from a request header (`LOOPIO_AUTH_PRINCIPAL_HEADER` / `-NAME`); it does **not** validate a signature. This is only safe when **(a)** the fronting proxy strips any client-supplied copy of that header and injects its own, and **(b)** the proxy is the *only* network path to the server. Otherwise any client that can reach the port can impersonate any user by setting the header. Azure App Service "Easy Auth" satisfies both automatically (it runs in-process ahead of the app and overwrites the `x-ms-client-principal*` headers, and the container is not independently reachable). Behind a separate gateway (APIM, Keycloak, NGINX, ...), you must configure both conditions yourself.

### Deploying behind Microsoft Entra (Azure App Service Easy Auth)

To offer this as a custom remote MCP connector to Claude Enterprise users with Entra as the IdP:

1. **Host the container** on Azure App Service for Containers (the shipped image runs `loopio-mcp-http`).
2. **Enable App Service authentication ("Easy Auth")** with the Microsoft Entra provider, set to *require authentication* (reject unauthenticated). The platform validates Entra tokens before traffic reaches the container.
3. **App settings:** put `LOOPIO_CLIENT_ID` / `LOOPIO_CLIENT_SECRET` in Key Vault references; set `LOOPIO_TRUST_PROXY_AUTH=true`, `LOOPIO_HTTP_ALLOWED_HOSTS=<your-host>`, and (recommended) `LOOPIO_READ_ONLY=true`. App Service injects `PORT`, which the server honors automatically.
4. **Register the connector** in Claude Enterprise (Org settings → Connectors). Entra does **not** support OAuth Dynamic Client Registration, so create an Entra app registration and supply the static client ID/secret under the connector's Advanced Settings.

Easy Auth forwards the user identity in `x-ms-client-principal` / `x-ms-client-principal-name`, which the server reads by default — no extra configuration needed. (Behind a different gateway, override the `LOOPIO_AUTH_*` header/claim variables.)

## Docker image (`ghcr.io/fredericboyer/loopio-mcp`)

The project ships a small distroless container image that runs `loopio-mcp-http`. It is published to `ghcr.io/fredericboyer/loopio-mcp` on each GitHub Release, tagged with the version, `MAJOR.MINOR`, and `latest`.

### Pull and run

```bash
docker run --rm -p 3000:3000 \
  -e LOOPIO_CLIENT_ID=... \
  -e LOOPIO_CLIENT_SECRET=... \
  ghcr.io/fredericboyer/loopio-mcp:latest
```

This starts the same HTTP server described in the security note above. Run it behind your authenticating proxy (and set `LOOPIO_TRUST_PROXY_AUTH=true` so it fails closed if bypassed), and set `LOOPIO_READ_ONLY=true` unless the deployment needs write access. All HTTP env vars (`LOOPIO_HTTP_PORT`, `LOOPIO_HTTP_HOST`, `LOOPIO_HTTP_ALLOWED_HOSTS`, `LOOPIO_TRUST_PROXY_AUTH`) and Loopio env vars apply unchanged.

### Health probes

The image exposes `GET /healthz` but has no built-in `HEALTHCHECK` instruction. Wire it up at the orchestrator level. Kubernetes example:

```yaml
readinessProbe:
  httpGet: { path: /healthz, port: 3000 }
livenessProbe:
  httpGet: { path: /healthz, port: 3000 }
```

### Build locally

```bash
docker build -t loopio-mcp .
```

### Package visibility

The GHCR package may be private on first publish. To allow unauthenticated pulls, open the package settings on GitHub and set visibility to public.

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
