import { DEFAULT_PRINCIPAL_OPTIONS, type PrincipalOptions } from "./http-principal.js";

export interface LoopioConfig {
  clientId: string;
  clientSecret: string;
  host: string;
  apiBasePath: string;
  tokenUrl: string;
  apiBaseUrl: string;
  scopes: string[];
  /** When true, only read tools are exposed (no writes or deletes). */
  readOnly: boolean;
  maxResults: number;
}

type Env = Record<string, string | undefined>;

function boolEnv(v: string | undefined): boolean {
  if (v === undefined) return false;
  const s = v.trim().toLowerCase();
  return s === "true" || s === "1" || s === "yes" || s === "on";
}

/**
 * Parse the read-only switch fail-closed. It is the only blast-radius control,
 * so: unset keeps the read-write default, an explicit recognized "off" value
 * (false/0/no/off, case-insensitive) enables writes, and ANY other value —
 * including typos or case variants like `True` — stays read-only rather than
 * silently enabling mutating tools.
 */
function readOnlyEnv(v: string | undefined): boolean {
  if (v === undefined || v.trim() === "") return false;
  const s = v.trim().toLowerCase();
  return !(s === "false" || s === "0" || s === "no" || s === "off");
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
  // Single switch: read-write by default (writes AND deletes), or set
  // LOOPIO_READ_ONLY=true to expose read tools only.
  const readOnly = readOnlyEnv(env.LOOPIO_READ_ONLY);

  const scopes = env.LOOPIO_SCOPES
    ? env.LOOPIO_SCOPES.split(/\s+/).filter(Boolean)
    : deriveScopes(!readOnly, !readOnly);

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
    readOnly,
    maxResults,
  };
}

export interface HttpConfig {
  port: number;
  host: string;
  allowedHosts: string[];
  /** Trust an authenticating reverse proxy and require a forwarded identity. */
  trustProxyAuth: boolean;
  /** Header/claim names used to read the forwarded identity. */
  principal: PrincipalOptions;
}

export function loadHttpConfig(env: Env = process.env): HttpConfig {
  // Prefer the explicit var; fall back to PORT (injected by Azure App Service).
  const portRaw = env.LOOPIO_HTTP_PORT ?? env.PORT;
  let port = 3000;
  if (portRaw !== undefined && portRaw !== "") {
    const parsed = Number(portRaw);
    if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
      throw new Error("Invalid HTTP port: must be a port number 1-65535");
    }
    port = parsed;
  }

  const host = env.LOOPIO_HTTP_HOST ?? "0.0.0.0";

  const allowedHosts = env.LOOPIO_HTTP_ALLOWED_HOSTS
    ? env.LOOPIO_HTTP_ALLOWED_HOSTS.split(",")
        .map((h) => h.trim())
        .filter(Boolean)
    : [`127.0.0.1:${port}`, `localhost:${port}`];

  const principal: PrincipalOptions = {
    header: env.LOOPIO_AUTH_PRINCIPAL_HEADER ?? DEFAULT_PRINCIPAL_OPTIONS.header,
    nameHeader: env.LOOPIO_AUTH_NAME_HEADER ?? DEFAULT_PRINCIPAL_OPTIONS.nameHeader,
    nameClaim: env.LOOPIO_AUTH_NAME_CLAIM ?? DEFAULT_PRINCIPAL_OPTIONS.nameClaim,
    rolesClaim: env.LOOPIO_AUTH_ROLES_CLAIM ?? DEFAULT_PRINCIPAL_OPTIONS.rolesClaim,
  };

  return {
    port,
    host,
    allowedHosts,
    trustProxyAuth: boolEnv(env.LOOPIO_TRUST_PROXY_AUTH),
    principal,
  };
}

/**
 * A startup warning to log when the HTTP server is bound to a non-loopback
 * address without proxy-auth — i.e. reachable and unauthenticated, so anyone
 * who can reach it drives the shared Loopio credentials. Returns null when the
 * binding is safe (loopback, or proxy-auth enabled).
 */
export function exposureWarning(config: LoopioConfig, http: HttpConfig): string | null {
  const loopback = http.host === "127.0.0.1" || http.host === "localhost";
  if (http.trustProxyAuth || loopback) return null;
  const writeRisk = config.readOnly
    ? ""
    : " Write tools are enabled, so an exposed port could change or delete Loopio data;" +
      " set LOOPIO_READ_ONLY=true to reduce blast radius.";
  return (
    `WARNING: bound to ${http.host} (not loopback) without proxy-auth. This server does not ` +
    "authenticate requests; anyone who can reach it drives the shared Loopio credentials. " +
    "Front it with an auth proxy and set LOOPIO_TRUST_PROXY_AUTH=true, or bind to loopback." +
    writeRisk
  );
}
