import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { LoopioError } from "../loopio/http.js";

export function jsonResult(data: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

export function textResult(text: string): CallToolResult {
  return { content: [{ type: "text", text }] };
}

export function errorResult(err: unknown): CallToolResult {
  const text =
    err instanceof LoopioError ? err.message : err instanceof Error ? err.message : String(err);
  return { content: [{ type: "text", text }], isError: true };
}

/** Wrap a handler body so thrown errors become isError results. */
export async function guard(fn: () => Promise<CallToolResult>): Promise<CallToolResult> {
  try {
    return await fn();
  } catch (err) {
    return errorResult(err);
  }
}
