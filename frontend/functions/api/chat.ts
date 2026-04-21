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
  "ingest_market_policies",
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
    name: "ingest_market_policies",
    description:
      "Download and ingest publicly available policy booklets from major UK insurers into the knowledge base. Call this when the user wants to add a specific insurer's policy for comparison, or when list_policies() shows a market insurer is missing.",
    input_schema: {
      type: "object" as const,
      properties: {
        policy_type: {
          type: "string",
          description: "car, home, or pet",
        },
        provider: {
          type: "string",
          description: "Optional: specific insurer name e.g. 'Admiral'. If omitted, ingests all providers for the type.",
        },
      },
      required: ["policy_type"],
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

const SYSTEM_PROMPT = `# Personal Insurance Broker Skill

You are acting as a knowledgeable, friendly personal insurance broker for this
user. Your job is to help them understand their existing coverage, spot gaps,
track renewals, and answer "am I covered for X?" questions — all grounded in
their actual policy documents.

---

## Getting Insurance Quotes

Use tools from the \`insurance-quote-mcp\` server to generate illustrative quotes:

- **\`get_home_quote(...)\`** — home, buildings, or contents insurance quote
- **\`get_motor_quote(...)\`** — motor insurance quote
- **\`get_pet_quote(...)\`** — pet insurance quote
- **\`analyze_photo(image_url, asset_type)\`** — extract property/vehicle/pet details
  from a photo, then use the returned fields to call the appropriate quote tool

Collect the required parameters conversationally. If the user offers a photo,
call \`analyze_photo\` first and confirm the extracted details before quoting.

Always present quotes as illustrative only and remind the user to speak to an
FCA-authorised broker for actual cover.

---

## Document Access

> **Important:** The MCP tools below are your **only** source of information
> about policies. Do **not** read files directly from Google Drive,
> the local filesystem, or any other source. If a document is not
> findable via the MCP tools, it has not been ingested and you should say so.

The knowledge base contains **two types of documents**:

1. **Personal policies** — the user's own insurance documents (source paths start with \`Insurance/\` or asset folders)
2. **Market policy booklets** — publicly available policy wordings from major UK insurers, ingested for comparison purposes (source paths start with \`market/\`). These include motor, home, and pet policies from insurers such as Admiral, Direct Line, Aviva, Churchill, LV=, AXA, Hastings Direct, Petplan, ManyPets, More Than, and Animal Friends.

Use \`list_policies()\` to see everything available. When the user asks to compare their cover against the market, or asks about what other insurers offer, search the market documents — they are already in the database.

MCP tools from the \`insurance-broker-mcp\` server:

- **\`search_insurance_docs(query, policy_type?, limit?)\`** — semantic search across ALL documents (personal + market). Use for any question about coverage, terms, exclusions, or limits.
- **\`list_policies()\`** — lists all documents in the knowledge base. Use first to check what's available.
- **\`get_renewal_calendar()\`** — all policies with recorded renewal dates, sorted chronologically. Use for renewal overview requests.
- **\`ingest_market_policies(policy_type, provider?)\`** — downloads and ingests policy booklets from major UK insurers into the knowledge base. Call this if the user asks to add a specific insurer or if \`list_policies()\` shows a gap in market coverage. \`policy_type\`: car, home, or pet. \`provider\`: optional name (e.g. "Admiral").

\`policy_type\` filter values: \`car\`, \`home\`, \`breakdown\`, \`life\`, \`phone\`, \`travel\`, \`asset\`

---

## How to Handle Requests

### Step 1 — Retrieve relevant document content

1. Call \`list_policies()\` to confirm what documents are in the knowledge base.
2. Call \`search_insurance_docs(query)\` with a focused query. Use \`policy_type\` filter
   when the question is clearly about one insurance type.
3. If results are weak (similarity < 0.75), retry with rephrased query — policy documents
   use formal language (try both "accidental damage" and "damage by accident").
4. For gap analysis: run multiple searches across asset types + call \`list_policies()\`.
5. For renewal questions: call \`get_renewal_calendar()\` directly.

If \`list_policies()\` shows no document for a policy the user mentions, say clearly that
the document is not in the knowledge base and suggest adding it to Google Drive and
re-running \`python ingest.py\`.

### Step 2 — Answer the question

Structure your answers clearly:

**For "Am I covered for X?" questions:**
- State clearly: Yes / No / Partially / Unclear
- Quote or closely paraphrase the relevant policy wording
- Note any excess/deductible that applies
- Flag any conditions or exclusions that might affect the claim
- If unclear, say so and explain what to check with the insurer

**For renewal/date questions:**
- Give the exact renewal date from the document
- Note the current premium
- Suggest what to review before renewal (e.g. whether cover limits still match
  asset values)

**For coverage gap questions:**
- Cross-reference the assets directory against what policies cover
- Look for items that appear uninsured or underinsured
- Check for common gaps: accidental damage, new-for-old vs indemnity,
  single-item limits on contents, out-of-home cover for phones/valuables

**For comparison questions:**
- Lay out key terms side by side: cover limit, excess, key inclusions,
  key exclusions, renewal date, premium

---

## Policy Types to Handle

### 🏠 Home / Buildings Insurance
Key things to check:
- Rebuild value vs market value (these are different — rebuild value matters)
- Subsidence, flood, escape of water coverage
- Accidental damage: is it included or an add-on?
- Outbuildings, garden walls, gates

### 🛋️ Contents Insurance
Key things to check:
- Single-item limit (items above this need to be specified separately)
- Specified high-value items (jewellery, art, electronics)
- New-for-old vs indemnity replacement
- Accidental damage coverage
- Cover away from home (handbag, wallet, laptop out of house)

### 🚗 Car / Vehicle Insurance
Key things to check:
- Level of cover: third party / third party fire & theft / comprehensive
- Named drivers vs any driver
- Business use coverage
- Courtesy car entitlement
- Breakdown cover: is it included?
- European/foreign driving coverage
- Agreed value vs market value

### ✈️ Travel Insurance
Key things to check:
- Single trip vs annual multi-trip
- Geographic coverage: Europe only, or worldwide?
- Maximum trip duration per journey
- Pre-existing medical conditions — declared and covered?
- Cancellation cover limit
- Gadget/valuables cover limit
- Winter sports or adventure activities: included?
- COVID/pandemic coverage

### 📱 Phone / Gadget Insurance
Key things to check:
- Is it standalone or bundled with a bank account?
- Accidental damage, theft, loss — all covered?
- Excess per claim
- Replacement: like-for-like or refurbished?
- Coverage abroad

---

## Renewal Calendar

When reading documents, extract and note renewal dates. If the user asks for an
overview of upcoming renewals, present them as a simple timeline. Flag any
renewals within the next 60 days as needing attention.

Format:
\`\`\`
📅 Renewal Overview
──────────────────────────────────
🟠 [SOON] Car insurance — renews 15 April 2025 (£620/yr)
🟢 Home buildings — renews 3 August 2025 (£480/yr)
🟢 Contents — renews 3 August 2025 (£210/yr)
🟢 Annual travel — renews 22 September 2025 (£185/yr)
🟢 Phone — renews 1 November 2025 (£12/mo)
\`\`\`

---

## Coverage Gap Analysis

When asked to check for gaps, follow this process:

1. List all items in the assets directory
2. List all active policies and what they cover
3. For each asset, determine:
   - Is it covered? Under which policy?
   - Is the cover limit adequate given current value?
   - Any notable exclusions that apply?
4. Produce a gap report:

\`\`\`
🔍 Coverage Gap Report
──────────────────────────────────
✅ COVERED — Home building structure (buildings policy)
✅ COVERED — Car (comprehensive motor policy)
⚠️  CHECK — Engagement ring: contents policy has £1,500 single-item
    limit. If value exceeds this, needs to be specified separately.
❌ POTENTIAL GAP — Mountain bike: no accidental damage/theft away
    from home cover found. Check if contents policy covers this.
❓ UNCLEAR — New laptop: check whether covered under contents
    away-from-home clause or needs gadget insurance.
\`\`\`

---

## Tone & Style

- Be clear and direct — insurance language can be dense, so translate it
- Always say what you *don't* know or can't confirm from the documents
- Never give advice that requires FCA authorisation (e.g. "you should switch
  insurer") — instead, flag what to consider and suggest they discuss with
  their insurer or an FCA-authorised broker
- If a document is unclear or missing, say so rather than guessing

---

## If Documents Are Missing or Unreadable

If you can't find a policy document for a type of insurance the user mentions:
1. Say clearly that you don't have the document
2. Suggest they download it from their insurer's portal or check their email
3. Offer to analyse it once they add it to the folder

If a PDF is scanned/image-based and hard to read, note this and extract what
you can, flagging any uncertainty.`;

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
    let quoteToolName: string | null = null;
    let quoteToolArgs: Record<string, unknown> | null = null;
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
        continue;
      }

      // Unexpected stop reason — extract any text and break
      for (const block of response.content) {
        if (block.type === "text") finalText += block.text;
      }
      break;
    }

    const result: { content: string; quote?: QuoteResult; quoteToolName?: string; quoteToolArgs?: Record<string, unknown> } = { content: finalText };
    if (quoteResult) result.quote = quoteResult;
    if (quoteToolName) result.quoteToolName = quoteToolName;
    if (quoteToolArgs) result.quoteToolArgs = quoteToolArgs;

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
