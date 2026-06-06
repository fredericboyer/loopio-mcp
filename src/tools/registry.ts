import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ZodRawShape } from "zod";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export type Tier = "read" | "write" | "delete";

export interface ToolDef {
  name: string;
  tier: Tier;
  description: string;
  inputSchema: ZodRawShape;
  handler: (args: Record<string, unknown>) => Promise<CallToolResult>;
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
