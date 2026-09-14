/**
 * POST /api/identify-policy
 * Ports xero-insurance's identify_uploaded_policy: a small Claude tool-use
 * loop that searches for a just-uploaded document by filename and returns
 * its insurance type(s) plus key details, for the "pending analysis"
 * confirm-before-apply banner shown right after upload.
 */
import Anthropic from "@anthropic-ai/sdk";
import { callMCPTool } from "../mcp-client";
import type { Env } from "../index";
import { requireBusiness, unauthorizedResponse, withRefreshedCookie } from "../auth/require";

const BROKER_MCP_URL = "https://insurance-broker-production-85e3.up.railway.app/mcp";

const SEARCH_TOOL: Anthropic.Tool = {
  name: "search_insurance_docs",
  description: "Semantic search across insurance policy documents.",
  input_schema: {
    type: "object" as const,
    properties: {
      query: { type: "string", description: "Search query" },
      limit: { type: "integer", description: "Max results" },
    },
    required: ["query"],
  },
};

const SYSTEM_PROMPT = `You are identifying the type of an uploaded insurance policy document.
Use the search_insurance_docs tool to find the document, then return ONLY a JSON object — no other text.

Valid type codes:
- el       = Employers' Liability
- pl       = Public Liability
- pi       = Professional Indemnity
- cyber    = Cyber Liability
- do       = Directors & Officers
- property = Commercial Property
- product  = Product Liability
- bi       = Business Interruption
- transit  = Goods in Transit
- keyperson = Key Person Insurance

Return format (JSON only):
{"types": ["el"], "insurer": "AXA Insurance", "premium": "£600/yr", "cover_limit": "£10,000,000", "renewal_date": "01 Apr 2027", "notes": "Covers all permanent and temporary employees against workplace injury claims."}

If the document covers multiple types, list all: {"types": ["el", "pl"], ...}
The "notes" field should be 1-2 sentences summarising what is specifically covered based on the document content.
If you cannot determine the type, return: {"types": []}`;

interface IdentifyResult {
  types: string[];
  insurer?: string;
  premium?: string;
  cover_limit?: string;
  renewal_date?: string;
  notes?: string;
}

export async function handleIdentifyPolicy(request: Request, env: Env): Promise<Response> {
  const auth = await requireBusiness(request, env);
  if (!auth) return unauthorizedResponse();

  try {
    const { filename } = (await request.json()) as { filename?: string };
    if (!filename) {
      return new Response(JSON.stringify({ error: "filename is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    const messages: Anthropic.MessageParam[] = [
      {
        role: "user",
        content: `Search for the recently uploaded document "${filename}" using search_insurance_docs. Identify its insurance type(s) and return only the JSON.`,
      },
    ];

    let result: IdentifyResult = { types: [] };

    for (let i = 0; i < 6; i++) {
      const response = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 300,
        system: SYSTEM_PROMPT,
        tools: [SEARCH_TOOL],
        messages,
      });

      if (response.stop_reason === "tool_use") {
        messages.push({ role: "assistant", content: response.content });
        const toolResults: Anthropic.ToolResultBlockParam[] = [];
        for (const block of response.content) {
          if (block.type !== "tool_use") continue;
          let output: string;
          try {
            const input = { ...(block.input as Record<string, unknown>), business_id: auth.businessId };
            output = await callMCPTool(BROKER_MCP_URL, "search_insurance_docs", input);
          } catch (err) {
            output = `Error: ${err instanceof Error ? err.message : String(err)}`;
          }
          toolResults.push({ type: "tool_result", tool_use_id: block.id, content: output });
        }
        messages.push({ role: "user", content: toolResults });
        continue;
      }

      // end_turn or anything else — extract the JSON and stop.
      for (const block of response.content) {
        if (block.type !== "text") continue;
        const start = block.text.indexOf("{");
        const end = block.text.lastIndexOf("}") + 1;
        if (start >= 0 && end > start) {
          try {
            result = JSON.parse(block.text.slice(start, end));
          } catch {
            // leave default { types: [] }
          }
        }
      }
      break;
    }

    return withRefreshedCookie(
      new Response(JSON.stringify(result), { headers: { "Content-Type": "application/json" } }),
      auth.refreshedCookie
    );
  } catch (err) {
    console.error("Identify policy error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Identification failed" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
