import { describe, it, expect } from "vitest";
import { parsePrincipal, DEFAULT_PRINCIPAL_OPTIONS } from "../src/http-principal.js";

const opts = DEFAULT_PRINCIPAL_OPTIONS;

function encode(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj), "utf8").toString("base64");
}

describe("parsePrincipal", () => {
  it("parses Easy Auth claims, honoring name_typ/role_typ", () => {
    const header = encode({
      claims: [
        { typ: "name", val: "Jane Doe" },
        { typ: "roles", val: "Loopio.Write" },
        { typ: "roles", val: "Loopio.Delete" },
      ],
      name_typ: "name",
      role_typ: "roles",
    });
    const p = parsePrincipal({ "x-ms-client-principal": header }, opts);
    expect(p).toEqual({ name: "Jane Doe", roles: ["Loopio.Write", "Loopio.Delete"] });
  });

  it("prefers the direct name header", () => {
    const p = parsePrincipal({ "x-ms-client-principal-name": "jane@amilia.com" }, opts);
    expect(p).toEqual({ name: "jane@amilia.com", roles: [] });
  });

  it("supports a custom header and roles claim", () => {
    const header = encode({ claims: [{ typ: "groups", val: "writers" }] });
    const p = parsePrincipal(
      { "x-forwarded-user": header },
      { ...opts, header: "x-forwarded-user", rolesClaim: "groups" },
    );
    expect(p).toEqual({ name: "unknown", roles: ["writers"] });
  });

  it("returns null when no identity headers are present", () => {
    expect(parsePrincipal({}, opts)).toBeNull();
  });

  it("returns null on a malformed principal header", () => {
    expect(parsePrincipal({ "x-ms-client-principal": "!!!not-base64-json" }, opts)).toBeNull();
  });

  it("returns null on a valid-JSON but non-object payload (e.g. base64 of null)", () => {
    expect(parsePrincipal({ "x-ms-client-principal": encode(null) }, opts)).toBeNull();
    expect(parsePrincipal({ "x-ms-client-principal": encode(42) }, opts)).toBeNull();
  });

  it("matches a configured mixed-case header against lower-cased request keys", () => {
    const p = parsePrincipal(
      { "x-forwarded-user": "jane@amilia.com" },
      { ...opts, nameHeader: "X-Forwarded-User" },
    );
    expect(p).toEqual({ name: "jane@amilia.com", roles: [] });
  });

  it("takes the first value of an array-valued header", () => {
    const p = parsePrincipal({ "x-ms-client-principal-name": ["jane@amilia.com", "x"] }, opts);
    expect(p?.name).toBe("jane@amilia.com");
  });
});
