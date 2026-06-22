import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { z, ZodRawShape } from "zod";
import type { CallToolResult, ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";

export type Tier = "read" | "write" | "delete";

export interface ToolDef<S extends ZodRawShape = ZodRawShape> {
  name: string;
  /** Human-friendly display name shown in client UIs (falls back to `name`). */
  title?: string;
  tier: Tier;
  description: string;
  inputSchema: S;
  handler: (args: z.infer<z.ZodObject<S>>) => Promise<CallToolResult>;
}

/**
 * Maps our coarse access tier to MCP annotation hints. Clients (e.g. the
 * Claude UI) group tools by these hints: `readOnlyHint: true` lands in the
 * "Read-only tools" bucket, everything else in "Write/delete tools", where
 * `destructiveHint` marks the irreversible ones for a stronger approval prompt.
 *
 * These are advisory hints for display/consent only; real gating stays in
 * `selectTools`.
 */
export function annotationsForTier(tier: Tier): ToolAnnotations {
  switch (tier) {
    case "read":
      return { readOnlyHint: true };
    case "write":
      return { readOnlyHint: false, destructiveHint: false };
    case "delete":
      return { readOnlyHint: false, destructiveHint: true };
  }
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
      {
        title: def.title ?? def.name,
        description: def.description,
        inputSchema: def.inputSchema,
        annotations: annotationsForTier(def.tier),
      },
      def.handler as never,
    );
  }
}
