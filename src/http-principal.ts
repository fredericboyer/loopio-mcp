/**
 * Identity extraction for proxy-auth mode.
 *
 * When the server runs behind an authenticating reverse proxy (Azure App
 * Service "Easy Auth", APIM, Keycloak, ...), the proxy validates the user and
 * forwards their identity in request headers. We never trust these headers
 * unless proxy-auth mode is explicitly enabled, because a direct caller could
 * otherwise forge them. The proxy is responsible for stripping inbound copies.
 *
 * Defaults target Easy Auth (`x-ms-client-principal` base64-JSON claims plus the
 * `x-ms-client-principal-name` convenience header) but every header and claim
 * name is overridable so the same code works behind other gateways.
 */

export interface PrincipalOptions {
  /** Header carrying base64-encoded JSON principal claims. */
  header: string;
  /** Header carrying the principal display name directly (optional convenience). */
  nameHeader: string;
  /** Claim type holding the display name inside the decoded principal. */
  nameClaim: string;
  /** Claim type holding role/group values inside the decoded principal. */
  rolesClaim: string;
}

export const DEFAULT_PRINCIPAL_OPTIONS: PrincipalOptions = {
  header: "x-ms-client-principal",
  nameHeader: "x-ms-client-principal-name",
  nameClaim: "name",
  rolesClaim: "roles",
};

export interface Principal {
  name: string;
  roles: string[];
}

type Headers = Record<string, string | string[] | undefined>;

function firstValue(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

interface EasyAuthClaim {
  typ?: string;
  val?: string;
}
interface EasyAuthPrincipal {
  claims?: EasyAuthClaim[];
  name_typ?: string;
  role_typ?: string;
}

/**
 * Extract the caller's identity from request headers. Returns null when no
 * identity is present or the encoded principal is malformed — callers in
 * proxy-auth mode treat null as "reject the request".
 */
export function parsePrincipal(headers: Headers, opts: PrincipalOptions): Principal | null {
  // Node/Express expose incoming header keys in lower case, so normalize the
  // configured (possibly mixed-case) header names before indexing.
  const nameDirect = firstValue(headers[opts.nameHeader.toLowerCase()])?.trim();
  const raw = firstValue(headers[opts.header.toLowerCase()])?.trim();

  let name = nameDirect;
  let roles: string[] = [];

  if (raw) {
    let decoded: unknown;
    try {
      decoded = JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
    } catch {
      // A present-but-unparseable principal header is a misconfiguration or a
      // forgery attempt; refuse rather than silently treating it as anonymous.
      return null;
    }
    // A syntactically valid but non-object payload (e.g. base64 of `null`) is
    // equally malformed; refuse instead of throwing on field access.
    if (decoded === null || typeof decoded !== "object") return null;
    const principal = decoded as EasyAuthPrincipal;
    const claims = Array.isArray(principal.claims) ? principal.claims : [];
    if (!name) {
      const nameTyp = principal.name_typ;
      name = claims.find((c) => c.typ === nameTyp || c.typ === opts.nameClaim)?.val;
    }
    const roleTyp = principal.role_typ ?? opts.rolesClaim;
    roles = claims
      .filter((c) => c.typ === roleTyp || c.typ === opts.rolesClaim)
      .map((c) => c.val)
      .filter((v): v is string => typeof v === "string" && v.length > 0);
  }

  if (!name && roles.length === 0) return null;
  return { name: name ?? "unknown", roles };
}
