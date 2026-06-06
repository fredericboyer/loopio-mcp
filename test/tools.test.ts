import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { selectTools, registerTools, type ToolDef } from "../src/tools/registry.js";

const defs: ToolDef[] = [
  { name: "read_tool", tier: "read", description: "r", inputSchema: {}, handler: async () => ok("r") },
  { name: "write_tool", tier: "write", description: "w", inputSchema: {}, handler: async () => ok("w") },
  { name: "delete_tool", tier: "delete", description: "d", inputSchema: {}, handler: async () => ok("d") },
];

function ok(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

describe("selectTools", () => {
  it("read-only exposes only read tools", () => {
    const names = selectTools(defs, { enableWrites: false, enableDeletes: false }).map((d) => d.name);
    expect(names).toEqual(["read_tool"]);
  });
  it("writes expose read + write but not delete", () => {
    const names = selectTools(defs, { enableWrites: true, enableDeletes: false }).map((d) => d.name);
    expect(names).toEqual(["read_tool", "write_tool"]);
  });
  it("writes + deletes expose all", () => {
    const names = selectTools(defs, { enableWrites: true, enableDeletes: true }).map((d) => d.name);
    expect(names).toEqual(["read_tool", "write_tool", "delete_tool"]);
  });
});

describe("registerTools", () => {
  it("registers exactly the selected tools on the server", () => {
    const server = { registerTool: vi.fn() };
    registerTools(server as any, defs, { enableWrites: false, enableDeletes: false });
    expect(server.registerTool).toHaveBeenCalledTimes(1);
    expect(server.registerTool.mock.calls[0][0]).toBe("read_tool");
  });
});
