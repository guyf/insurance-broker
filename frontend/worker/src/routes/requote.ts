import { callMCPTool } from "../mcp-client";
import type { Env } from "../index";
import { requireBusiness, unauthorizedResponse, withRefreshedCookie } from "../auth/require";
import { parseQuoteResult, QUOTE_TOOL_TYPES } from "../lib/quotes";

const QUOTE_MCP_URL = "https://alluring-prosperity-production-5644.up.railway.app/mcp";

export async function handleRequote(request: Request, env: Env): Promise<Response> {
  const auth = await requireBusiness(request, env);
  if (!auth) return unauthorizedResponse();

  try {
    const body = (await request.json()) as {
      toolName: string;
      args: Record<string, unknown>;
    };

    const { toolName, args } = body;
    const allowed = new Set(Object.keys(QUOTE_TOOL_TYPES));
    if (!allowed.has(toolName)) {
      return new Response(JSON.stringify({ error: "Invalid tool" }), { status: 400 });
    }

    const output = await callMCPTool(QUOTE_MCP_URL, toolName, args);
    const quote = parseQuoteResult(toolName, output);

    if (!quote) {
      return new Response(JSON.stringify({ error: "Failed to parse quote" }), { status: 502 });
    }

    return withRefreshedCookie(
      new Response(JSON.stringify({ quote }), { headers: { "Content-Type": "application/json" } }),
      auth.refreshedCookie
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
