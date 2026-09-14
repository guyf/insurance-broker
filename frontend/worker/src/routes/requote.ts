import { callMCPTool } from "../mcp-client";
import type { Env } from "../index";
import { requireBusiness, unauthorizedResponse, withRefreshedCookie } from "../auth/require";

const QUOTE_MCP_URL = "https://alluring-prosperity-production-5644.up.railway.app/mcp";

interface InsurerQuote {
  name: string;
  annual: number;
  monthly: number;
  excess: number;
  features: Array<{ included: boolean; text: string }>;
}

interface QuoteResult {
  type: "home" | "motor" | "pet";
  ref: string;
  insurers: InsurerQuote[];
}

function parseQuoteResult(toolName: string, text: string): QuoteResult | null {
  const typeMap: Record<string, "home" | "motor" | "pet"> = {
    get_home_quote: "home",
    get_motor_quote: "motor",
    get_pet_quote: "pet",
  };
  const type = typeMap[toolName];
  if (!type) return null;

  const refMatch = text.match(/Quote Reference:\s*(\S+)/);
  const ref = refMatch?.[1] ?? "";

  const lines = text.split("\n");
  const insurers: InsurerQuote[] = [];
  let current: InsurerQuote | null = null;

  for (const line of lines) {
    const header = line.match(
      /[🥇🥈🥉]\s+(.+?)\s{2,}£([\d,]+)\/yr\s+\(£([\d,]+)\/mo\)\s+Excess:\s+£(\d+)/
    );
    if (header) {
      if (current) insurers.push(current);
      current = {
        name: header[1].trim(),
        annual: parseInt(header[2].replace(/,/g, "")),
        monthly: parseInt(header[3].replace(/,/g, "")),
        excess: parseInt(header[4]),
        features: [],
      };
    } else if (current && /^\s+[✓✗]/.test(line)) {
      current.features.push({
        included: line.includes("✓"),
        text: line.replace(/^\s+[✓✗]\s*/, "").trim(),
      });
    }
  }
  if (current) insurers.push(current);

  return insurers.length > 0 ? { type, ref, insurers } : null;
}

export async function handleRequote(request: Request, env: Env): Promise<Response> {
  const auth = await requireBusiness(request, env);
  if (!auth) return unauthorizedResponse();

  try {
    const body = (await request.json()) as {
      toolName: string;
      args: Record<string, unknown>;
    };

    const { toolName, args } = body;
    const allowed = new Set(["get_home_quote", "get_motor_quote", "get_pet_quote"]);
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
