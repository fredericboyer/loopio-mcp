export interface LoopioConfig {
  clientId: string;
  clientSecret: string;
  host: string;
  apiBasePath: string;
  tokenUrl: string;
  apiBaseUrl: string;
  scopes: string[];
  enableWrites: boolean;
  enableDeletes: boolean;
  maxResults: number;
}

type Env = Record<string, string | undefined>;

function boolEnv(v: string | undefined): boolean {
  return v === "true" || v === "1";
}

export function deriveScopes(enableWrites: boolean, enableDeletes: boolean): string[] {
  const scopes = ["library:read", "project:read"];
  if (enableWrites) scopes.push("library:write", "project:write");
  if (enableWrites && enableDeletes) scopes.push("library:delete");
  return scopes;
}

export function loadConfig(env: Env = process.env): LoopioConfig {
  const clientId = env.LOOPIO_CLIENT_ID;
  const clientSecret = env.LOOPIO_CLIENT_SECRET;
  if (!clientId) throw new Error("Missing required env var LOOPIO_CLIENT_ID");
  if (!clientSecret) throw new Error("Missing required env var LOOPIO_CLIENT_SECRET");

  const host = env.LOOPIO_HOST ?? "api.loopio.com";
  const apiBasePath = env.LOOPIO_API_BASE_PATH ?? "/data/v2";
  const enableWrites = boolEnv(env.LOOPIO_ENABLE_WRITES);
  // Deletes are ignored unless writes are also enabled.
  const enableDeletes = enableWrites && boolEnv(env.LOOPIO_ENABLE_DELETES);

  const scopes = env.LOOPIO_SCOPES
    ? env.LOOPIO_SCOPES.split(/\s+/).filter(Boolean)
    : deriveScopes(enableWrites, enableDeletes);

  let maxResults = 200;
  if (env.LOOPIO_MAX_RESULTS !== undefined && env.LOOPIO_MAX_RESULTS !== "") {
    const parsed = Number(env.LOOPIO_MAX_RESULTS);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new Error("Invalid LOOPIO_MAX_RESULTS: must be a positive integer");
    }
    maxResults = parsed;
  }

  return {
    clientId,
    clientSecret,
    host,
    apiBasePath,
    tokenUrl: `https://${host}/oauth2/access_token`,
    apiBaseUrl: `https://${host}${apiBasePath}`,
    scopes,
    enableWrites,
    enableDeletes,
    maxResults,
  };
}

export interface HttpConfig {
  port: number;
  host: string;
  allowedHosts: string[];
}

export function loadHttpConfig(env: Env = process.env): HttpConfig {
  let port = 3000;
  if (env.LOOPIO_HTTP_PORT !== undefined && env.LOOPIO_HTTP_PORT !== "") {
    const parsed = Number(env.LOOPIO_HTTP_PORT);
    if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
      throw new Error("Invalid LOOPIO_HTTP_PORT: must be a port number 1-65535");
    }
    port = parsed;
  }

  const host = env.LOOPIO_HTTP_HOST ?? "0.0.0.0";

  const allowedHosts = env.LOOPIO_HTTP_ALLOWED_HOSTS
    ? env.LOOPIO_HTTP_ALLOWED_HOSTS.split(",")
        .map((h) => h.trim())
        .filter(Boolean)
    : [`127.0.0.1:${port}`, `localhost:${port}`];

  return { port, host, allowedHosts };
}
