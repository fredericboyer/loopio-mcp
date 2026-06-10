import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { z, ZodRawShape } from "zod";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export type Tier = "read" | "write" | "delete";

export interface ToolDef<S extends ZodRawShape = ZodRawShape> {
  name: string;
  tier: Tier;
  description: string;
  inputSchema: S;
  handler: (args: z.infer<z.ZodObject<S>>) => Promise<CallToolResult>;
}

/**
 * Preserves per-tool argument inference at the definition site while letting
 * heterogeneous tools share one ToolDef[] list. The erasing cast is safe because
 * the MCP SDK validates arguments against inputSchema before calling the handler.
 */
export function defineTool<S extends ZodRawShape>(def: ToolDef<S>): ToolDef {
  return def as unknown as ToolDef;
}

export interface ToolGating {
  enableWrites: boolean;
  enableDeletes: boolean;
}

export function selectTools(defs: ToolDef[], gating: ToolGating): ToolDef[] {
  return defs.filter((d) => {
    if (d.tier === "read") return true;
    if (d.tier === "write") return gating.enableWrites;
    if (d.tier === "delete") return gating.enableWrites && gating.enableDeletes;
    return false;
  });
}

export function registerTools(server: McpServer, defs: ToolDef[], gating: ToolGating): void {
  for (const def of selectTools(defs, gating)) {
    server.registerTool(
      def.name,
      { description: def.description, inputSchema: def.inputSchema },
      def.handler as never,
    );
  }
}
