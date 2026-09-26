import Anthropic from "@anthropic-ai/sdk";
import brokerSkill from "../../../../SKILL.md";
import { callMCPTool } from "../mcp-client";
import type { Env } from "../index";
import { requireBusiness, unauthorizedResponse, withRefreshedCookie } from "../auth/require";
import { supabaseAdmin } from "../lib/supabase";
import { parseQuoteResult, QUOTE_TOOL_TYPES, type QuoteResult } from "../lib/quotes";
import {
  appendMessages,
  createSession,
  getOwnedSession,
  loadHistory,
  toModelMessages,
  type StoredChatMessage,
} from "../lib/chat-store";

// Railway MCP server endpoints
const BROKER_MCP_URL =
  "https://insurance-broker-production-85e3.up.railway.app/mcp";
const QUOTE_MCP_URL =
  "https://alluring-prosperity-production-5644.up.railway.app/mcp";

// Which tools live on which server
// All broker tools read the business's own documents, so all are scoped to it.
const BROKER_TOOLS = new Set([
  "search_insurance_docs",
  "list_policies",
  "get_renewal_calendar",
]);
const QUOTE_TOOLS = new Set(Object.keys(QUOTE_TOOL_TYPES));

async function executeTool(
  toolName: string,
  toolInput: Record<string, unknown>,
  businessId: string
): Promise<string> {
  if (BROKER_TOOLS.has(toolName)) {
    // business_id is always injected server-side, never left to whatever Claude passed.
    return callMCPTool(BROKER_MCP_URL, toolName, { ...toolInput, business_id: businessId });
  }
  if (QUOTE_TOOLS.has(toolName)) {
    return callMCPTool(QUOTE_MCP_URL, toolName, toolInput);
  }
  throw new Error(`Unknown tool: ${toolName}`);
}

// ---------------------------------------------------------------------------
// Tool definitions (passed to Anthropic API)
// ---------------------------------------------------------------------------

const TOOLS: Anthropic.Tool[] = [
  {
    name: "search_insurance_docs",
    description:
      "Semantic search across the business's uploaded policy documents. Use for any question about coverage, terms, exclusions, limits, premiums or renewal dates.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Search query" },
        policy_type: {
          type: "string",
          description:
            "Optional filter. Uploads are sometimes untagged, so usually omit this. Values: employers_liability, public_liability, professional_indemnity, cyber, commercial_property, business_interruption, product_liability, goods_in_transit, directors_officers, key_person",
        },
        limit: { type: "integer", description: "Max results (default 5)" },
      },
      required: ["query"],
    },
  },
  {
    name: "list_policies",
    description:
      "List all documents in the knowledge base. Use first to check what's available before searching.",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "get_renewal_calendar",
    description:
      "All policies with recorded renewal dates, sorted chronologically. Flags renewals within 60 days.",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "get_public_liability_quote",
    description:
      "Illustrative Public Liability quotes from three fictional UK insurers — third-party injury or property damage claims against the business.",
    input_schema: {
      type: "object" as const,
      properties: {
        revenue: { type: "number", description: "Annual revenue in £" },
        employees: { type: "integer", description: "Number of employees" },
        industry: { type: "string", description: "office / retail / hospitality / manufacturing / construction / engineering / technology / healthcare / other" },
        postcode: { type: "string", description: "UK postcode (optional)" },
        cover_limit: {
          type: "number",
          description: "1000000 / 2000000 / 5000000 / 10000000 (default 2000000)",
        },
      },
      required: ["revenue", "employees", "industry"],
    },
  },
  {
    name: "get_employers_liability_quote",
    description:
      "Illustrative Employers' Liability quotes (£10m cover) from three fictional UK insurers. Legally required for UK businesses with employees.",
    input_schema: {
      type: "object" as const,
      properties: {
        employees: { type: "integer", description: "Number of employees" },
        annual_payroll: { type: "number", description: "Total annual payroll in £" },
        industry: { type: "string", description: "office / retail / hospitality / manufacturing / construction / engineering / technology / healthcare / other" },
      },
      required: ["employees", "annual_payroll", "industry"],
    },
  },
  {
    name: "get_professional_indemnity_quote",
    description:
      "Illustrative Professional Indemnity quotes from three fictional UK insurers — negligence claims over professional advice or services.",
    input_schema: {
      type: "object" as const,
      properties: {
        revenue: { type: "number", description: "Annual revenue in £" },
        profession: {
          type: "string",
          description: "technology / consulting / marketing / architecture / engineering / legal / financial / general",
        },
        cover_limit: {
          type: "number",
          description: "250000 / 500000 / 1000000 / 2000000 (default 500000)",
        },
      },
      required: ["revenue", "profession"],
    },
  },
  {
    name: "get_cyber_quote",
    description:
      "Illustrative Cyber Liability quotes from three fictional UK insurers — data breaches, ransomware, IT business interruption, response and legal costs.",
    input_schema: {
      type: "object" as const,
      properties: {
        revenue: { type: "number", description: "Annual revenue in £" },
        employees: { type: "integer", description: "Number of employees" },
        industry: {
          type: "string",
          description: "technology / finance / healthcare / retail / office / construction / manufacturing / other",
        },
        data_records_held: {
          type: "integer",
          description: "Approximate number of customer/employee data records held (default 0)",
        },
      },
      required: ["revenue", "employees", "industry"],
    },
  },
];

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const MODEL = "claude-sonnet-4-6";

/**
 * Bump whenever SYSTEM_PROMPT or TOOLS change meaningfully — stored on every
 * persisted chat turn so reviewed conversations can be tied back to the
 * prompt that produced them.
 */
export const PROMPT_VERSION = "2026-09-26.3";

/**
 * The broker's base prompt is the repo-root SKILL.md — one source of truth,
 * also usable as-is as a Claude Desktop / Claude Code skill. Bundled at build
 * time as text (see the [[rules]] Text entry in wrangler.toml); the YAML
 * frontmatter is skill metadata, not prompt, so it's stripped here.
 */
const SYSTEM_PROMPT = brokerSkill.replace(/^---\n[\s\S]*?\n---\n/, "").trim();

// ---------------------------------------------------------------------------
// Worker route handler
// ---------------------------------------------------------------------------

/**
 * Standing instructions managed at /admin/instructions (broker_instructions,
 * migration 014), appended to SYSTEM_PROMPT on every turn.
 */
async function loadInstructions(env: Env): Promise<string[]> {
  const { data, error } = await supabaseAdmin(env)
    .from("broker_instructions")
    .select("text")
    .eq("enabled", true)
    .order("sort", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) {
    console.error("Failed to load broker instructions:", error.message);
    return [];
  }
  return (data ?? []).map((r) => r.text as string);
}

/** The "This business" section SKILL.md refers to: name + latest accounting snapshot. */
async function loadBusinessContext(env: Env, businessId: string): Promise<string> {
  const supabase = supabaseAdmin(env);
  const [{ data: business }, { data: f }, { data: connections }] = await Promise.all([
    supabase.from("businesses").select("name").eq("id", businessId).maybeSingle(),
    supabase
      .from("business_financials")
      .select("source, revenue, employees, payroll, fixed_assets, industry, fetched_at")
      .eq("business_id", businessId)
      .maybeSingle(),
    supabase.from("business_connections").select("provider").eq("business_id", businessId),
  ]);

  const gbp = (n: number | null) => (n == null ? null : `£${Math.round(Number(n)).toLocaleString("en-GB")}`);
  const lines = [`- Name: ${business?.name || "(not set)"}`];
  const connected = (connections ?? []).map((c) => c.provider).join(", ");
  lines.push(`- Connected accounting: ${connected || "none"}`);

  if (f) {
    const fields: Array<[string, string | null]> = [
      ["Annual revenue", gbp(f.revenue)],
      ["Employees", f.employees == null ? null : String(f.employees)],
      ["Annual payroll", gbp(f.payroll)],
      ["Fixed assets", gbp(f.fixed_assets)],
      ["Industry", f.industry],
    ];
    const source = f.source === "manual" ? "entered manually" : `from ${f.source}`;
    lines.push(`- Financials (${source}, as of ${new Date(f.fetched_at).toISOString().slice(0, 10)}):`);
    for (const [label, value] of fields) lines.push(`  - ${label}: ${value ?? "unknown"}`);
  } else {
    lines.push("- Financials: none on record");
  }
  return lines.join("\n");
}

function buildSystemPrompt(businessContext: string, instructions: string[]): string {
  const base = `${SYSTEM_PROMPT}

---

## This business

${businessContext}`;
  if (!instructions.length) return base;
  return `${base}

---

## Standing instructions from Denney Insurance

Follow every one of these in every reply. Where they conflict with anything
above, these take precedence.

${instructions.map((i) => `- ${i}`).join("\n")}`;
}

export async function handleChat(request: Request, env: Env): Promise<Response> {
  const auth = await requireBusiness(request, env);
  if (!auth) return unauthorizedResponse();

  try {
    const body = (await request.json()) as {
      session_id?: string;
      message?: string;
      /** Assistant text the UI showed outside the chat loop since the last turn (e.g. Analyse Policies summary). */
      notes?: string[];
    };
    const text = typeof body.message === "string" ? body.message.trim() : "";
    if (!text) return jsonError("message is required", 400);

    // Resolve the session — always scoped to the caller's business, never trusted from the client.
    let sessionId: string;
    if (body.session_id) {
      const session = await getOwnedSession(env, body.session_id, auth.businessId);
      if (!session) return jsonError("Chat session not found", 404);
      sessionId = session.id;
    } else {
      sessionId = await createSession(env, auth.businessId, auth.userId, text.slice(0, 80));
    }

    const [history, instructions, businessContext] = await Promise.all([
      loadHistory(env, sessionId),
      loadInstructions(env),
      loadBusinessContext(env, auth.businessId),
    ]);
    const systemPrompt = buildSystemPrompt(businessContext, instructions);
    let seq = history.length ? history[history.length - 1].seq + 1 : 0;
    const newRows: StoredChatMessage[] = [];
    const addRow = (row: Omit<StoredChatMessage, "seq">) => newRows.push({ ...row, seq: seq++ });

    for (const note of body.notes ?? []) {
      if (typeof note === "string" && note.trim()) {
        addRow({ role: "assistant", kind: "note", content: [{ type: "text", text: note }] });
      }
    }
    addRow({ role: "user", kind: "user", content: [{ type: "text", text }] });

    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    const messages = toModelMessages([...history, ...newRows]);

    let quoteResult: QuoteResult | null = null;
    let quoteToolName: string | null = null;
    let quoteToolArgs: Record<string, unknown> | null = null;
    let finalText = "";
    let finalSeq: number | null = null;
    let loopError: unknown = null;

    try {
      // Agentic loop
      for (let iteration = 0; iteration < 10; iteration++) {
        const started = Date.now();
        const response = await client.messages.create({
          model: MODEL,
          max_tokens: 4096,
          system: systemPrompt,
          tools: TOOLS,
          messages,
        });
        const turnMeta = {
          model: MODEL,
          prompt_version: PROMPT_VERSION,
          instructions,
          input_tokens: response.usage.input_tokens,
          output_tokens: response.usage.output_tokens,
          latency_ms: Date.now() - started,
        };

        if (response.stop_reason === "tool_use") {
          // Append assistant message with all content blocks
          messages.push({ role: "assistant", content: response.content });

          // Execute all tool calls, collect results
          const toolResults: Anthropic.ToolResultBlockParam[] = [];

          for (const block of response.content) {
            if (block.type !== "tool_use") continue;

            let toolOutput: string;
            try {
              toolOutput = await executeTool(
                block.name,
                block.input as Record<string, unknown>,
                auth.businessId
              );
            } catch (err) {
              toolOutput = `Error: ${err instanceof Error ? err.message : String(err)}`;
            }

            // Check if this is a quote tool call
            if (QUOTE_TOOLS.has(block.name)) {
              const parsed = parseQuoteResult(block.name, toolOutput);
              if (parsed) {
                quoteResult = parsed;
                quoteToolName = block.name;
                quoteToolArgs = block.input as Record<string, unknown>;
              }
            }

            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: toolOutput,
            });
          }

          // Append tool results as user message
          messages.push({ role: "user", content: toolResults });
          // Recorded as a pair so persisted history never has a tool_use without its result
          addRow({ role: "assistant", kind: "tool_call", content: response.content, ...turnMeta });
          addRow({ role: "user", kind: "tool_result", content: toolResults });
          continue;
        }

        // end_turn, or an unexpected stop reason — extract any text and stop
        for (const block of response.content) {
          if (block.type === "text") finalText += block.text;
        }
        finalSeq = seq;
        addRow({ role: "assistant", kind: "assistant", content: response.content, quote: quoteResult, ...turnMeta });
        break;
      }
    } catch (err) {
      loopError = err;
    }

    // Persist whatever completed, even if the loop failed part-way
    const ids = await appendMessages(env, sessionId, newRows);
    if (loopError) throw loopError;

    const result: {
      session_id: string;
      message_id: string | null;
      content: string;
      quote?: QuoteResult;
      quoteToolName?: string;
      quoteToolArgs?: Record<string, unknown>;
    } = {
      session_id: sessionId,
      message_id: finalSeq !== null ? ids.get(finalSeq) ?? null : null,
      content: finalText,
    };
    if (quoteResult) result.quote = quoteResult;
    if (quoteToolName) result.quoteToolName = quoteToolName;
    if (quoteToolArgs) result.quoteToolArgs = quoteToolArgs;

    return withRefreshedCookie(
      new Response(JSON.stringify(result), { headers: { "Content-Type": "application/json" } }),
      auth.refreshedCookie
    );
  } catch (err) {
    console.error("Chat route error:", err);
    return jsonError(err instanceof Error ? err.message : "Internal error", 500);
  }
}

function jsonError(error: string, status: number): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
