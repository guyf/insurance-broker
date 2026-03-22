import Anthropic from "@anthropic-ai/sdk";

// Railway MCP server endpoints
const BROKER_MCP_URL =
  "https://insurance-broker-production-85e3.up.railway.app/mcp";
const QUOTE_MCP_URL =
  "https://alluring-prosperity-production-5644.up.railway.app/mcp";

// Which tools live on which server
const BROKER_TOOLS = new Set([
  "search_insurance_docs",
  "list_policies",
  "get_renewal_calendar",
]);
const QUOTE_TOOLS = new Set([
  "get_home_quote",
  "get_motor_quote",
  "get_pet_quote",
  "analyze_photo",
]);

// ---------------------------------------------------------------------------
// MCP client (stateless streamable-http)
// ---------------------------------------------------------------------------

function parseSSEContent(text: string): string {
  // Handle plain JSON response
  try {
    const msg = JSON.parse(text) as {
      result?: { content?: Array<{ type: string; text?: string }> };
      error?: { message: string };
    };
    if (msg.error) throw new Error(msg.error.message);
    if (msg.result?.content) {
      return msg.result.content
        .filter((c) => c.type === "text" && c.text)
        .map((c) => c.text!)
        .join("\n");
    }
  } catch {
    // not plain JSON — try SSE
  }

  // Parse SSE stream: "data: {...}\n\n"
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data: ")) continue;
    const data = trimmed.slice(6);
    if (!data || data === "[DONE]") continue;
    try {
      const msg = JSON.parse(data) as {
        result?: { content?: Array<{ type: string; text?: string }> };
        error?: { message: string };
      };
      if (msg.error) throw new Error(msg.error.message);
      if (msg.result?.content) {
        return msg.result.content
          .filter((c) => c.type === "text" && c.text)
          .map((c) => c.text!)
          .join("\n");
      }
    } catch (e) {
      if (e instanceof Error && e.message !== "Unexpected token") throw e;
    }
  }
  return text;
}

async function callMCPTool(
  serverUrl: string,
  toolName: string,
  args: Record<string, unknown>
): Promise<string> {
  // Step 1: initialize (required by MCP protocol even for stateless servers)
  const initResp = await fetch(serverUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "broker-web", version: "1.0" },
      },
      id: 0,
    }),
  });

  const sessionId = initResp.headers.get("mcp-session-id");
  await initResp.text(); // consume body

  // Step 2: notifications/initialized (fire-and-forget)
  const baseHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  if (sessionId) baseHeaders["mcp-session-id"] = sessionId;

  fetch(serverUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(sessionId ? { "mcp-session-id": sessionId } : {}) },
    body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} }),
  }).catch(() => {/* ignore */});

  // Step 3: tools/call
  const toolResp = await fetch(serverUrl, {
    method: "POST",
    headers: baseHeaders,
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "tools/call",
      params: { name: toolName, arguments: args },
      id: 1,
    }),
  });

  if (!toolResp.ok) {
    throw new Error(`MCP tool call failed: ${toolResp.status} ${toolResp.statusText}`);
  }

  return parseSSEContent(await toolResp.text());
}

async function executeTool(
  toolName: string,
  toolInput: Record<string, unknown>
): Promise<string> {
  if (BROKER_TOOLS.has(toolName)) {
    return callMCPTool(BROKER_MCP_URL, toolName, toolInput);
  }
  if (QUOTE_TOOLS.has(toolName)) {
    return callMCPTool(QUOTE_MCP_URL, toolName, toolInput);
  }
  throw new Error(`Unknown tool: ${toolName}`);
}

// ---------------------------------------------------------------------------
// Quote extraction — parse build_panel() output into structured data
// ---------------------------------------------------------------------------

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
    // Header line: "🥇 Beacon Insurance        £500/yr  (£42/mo)  Excess: £250"
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

// ---------------------------------------------------------------------------
// Tool definitions (passed to Anthropic API)
// ---------------------------------------------------------------------------

const TOOLS: Anthropic.Tool[] = [
  {
    name: "search_insurance_docs",
    description:
      "Semantic search across all insurance policy and asset documents. Use for any question about coverage, terms, exclusions, or limits.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Search query" },
        policy_type: {
          type: "string",
          description:
            "Optional filter: car, home, breakdown, life, phone, travel, asset",
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
    name: "get_home_quote",
    description:
      "Generate illustrative home insurance quotes from three fictional insurers.",
    input_schema: {
      type: "object" as const,
      properties: {
        property_type: {
          type: "string",
          description: "house / flat / bungalow / cottage",
        },
        bedrooms: { type: "integer", description: "Number of bedrooms" },
        rebuild_value: {
          type: "number",
          description: "Rebuild value in £ (not market value)",
        },
        postcode: { type: "string", description: "UK postcode" },
        year_built: {
          type: "integer",
          description: "Year built (default 1970)",
        },
        claims_last_5_years: {
          type: "integer",
          description: "Claims in last 5 years (default 0)",
        },
        cover_type: {
          type: "string",
          description: "buildings / contents / both (default both)",
        },
      },
      required: ["property_type", "bedrooms", "rebuild_value", "postcode"],
    },
  },
  {
    name: "get_motor_quote",
    description:
      "Generate illustrative motor insurance quotes from three fictional insurers.",
    input_schema: {
      type: "object" as const,
      properties: {
        make: { type: "string", description: "Vehicle manufacturer" },
        model: { type: "string", description: "Vehicle model" },
        year: { type: "integer", description: "Year of manufacture" },
        value: { type: "number", description: "Current market value in £" },
        driver_age: {
          type: "integer",
          description: "Age of main driver",
        },
        annual_mileage: {
          type: "integer",
          description: "Estimated annual mileage",
        },
        no_claims_years: {
          type: "integer",
          description: "Years of no-claims bonus (default 0)",
        },
        postcode: { type: "string", description: "UK postcode" },
        cover_level: {
          type: "string",
          description: "third_party / tpft / comprehensive (default comprehensive)",
        },
      },
      required: ["make", "model", "year", "value", "driver_age", "annual_mileage"],
    },
  },
  {
    name: "get_pet_quote",
    description:
      "Generate illustrative pet insurance quotes from three fictional insurers.",
    input_schema: {
      type: "object" as const,
      properties: {
        species: { type: "string", description: "dog / cat / rabbit / other" },
        breed: { type: "string", description: "Breed name" },
        age_years: {
          type: "number",
          description: "Age in years (can be fractional)",
        },
        vet_limit: {
          type: "integer",
          description: "Annual vet fee limit in £ (default 5000)",
        },
        neutered: { type: "boolean", description: "Whether neutered (default true)" },
      },
      required: ["species", "breed", "age_years"],
    },
  },
  {
    name: "analyze_photo",
    description:
      "Analyse a photo using GPT-4o-mini vision to extract asset details for pre-filling a quote.",
    input_schema: {
      type: "object" as const,
      properties: {
        image_url: {
          type: "string",
          description: "Publicly accessible URL of the image",
        },
        asset_type: { type: "string", description: "home / motor / pet" },
      },
      required: ["image_url", "asset_type"],
    },
  },
];

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a knowledgeable personal insurance broker assistant. Your job is to help the user understand their existing coverage, spot gaps, track renewals, and answer questions — all grounded in their actual policy documents.

## Document Access
Always use the provided tools to answer insurance questions — never rely on general knowledge alone.
- search_insurance_docs: semantic search across policy documents
- list_policies: inventory of all documents
- get_renewal_calendar: renewal dates, sorted chronologically

## Getting Quotes
Collect required parameters conversationally before calling quote tools. Ask only what you need.
- get_home_quote: needs property_type, bedrooms, rebuild_value, postcode
- get_motor_quote: needs make, model, year, value, driver_age, annual_mileage
- get_pet_quote: needs species, breed, age_years
- analyze_photo: call first if user provides a photo, then confirm extracted details

Always present quotes as illustrative only and remind the user to speak to an FCA-authorised broker for actual cover.

## Answering Coverage Questions
- State clearly: Yes / No / Partially / Unclear
- Quote or closely paraphrase relevant policy wording
- Note any excess/deductible
- Flag conditions or exclusions
- If a document is missing from the knowledge base, say so clearly

## Tone
Clear and direct. Translate insurance jargon. Never recommend switching insurer (not FCA-authorised). If unclear, say so rather than guessing.`;

// ---------------------------------------------------------------------------
// Cloudflare Pages Function handler
// ---------------------------------------------------------------------------

interface Env {
  ANTHROPIC_API_KEY: string;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  try {
    const body = (await request.json()) as {
      messages: Array<{ role: string; content: string }>;
    };

    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

    // Build the Anthropic messages array
    const messages: Anthropic.MessageParam[] = body.messages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    let quoteResult: QuoteResult | null = null;
    let finalText = "";

    // Agentic loop
    for (let iteration = 0; iteration < 10; iteration++) {
      const response = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        tools: TOOLS,
        messages,
      });

      if (response.stop_reason === "end_turn") {
        // Extract final text
        for (const block of response.content) {
          if (block.type === "text") finalText += block.text;
        }
        break;
      }

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
              block.input as Record<string, unknown>
            );
          } catch (err) {
            toolOutput = `Error: ${err instanceof Error ? err.message : String(err)}`;
          }

          // Check if this is a quote tool call
          if (QUOTE_TOOLS.has(block.name) && block.name !== "analyze_photo") {
            const parsed = parseQuoteResult(block.name, toolOutput);
            if (parsed) quoteResult = parsed;
          }

          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: toolOutput,
          });
        }

        // Append tool results as user message
        messages.push({ role: "user", content: toolResults });
        continue;
      }

      // Unexpected stop reason — extract any text and break
      for (const block of response.content) {
        if (block.type === "text") finalText += block.text;
      }
      break;
    }

    const result: { content: string; quote?: QuoteResult } = { content: finalText };
    if (quoteResult) result.quote = quoteResult;

    return new Response(JSON.stringify(result), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Chat function error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
