const QUOTE_MCP_URL = "https://alluring-prosperity-production-5644.up.railway.app/mcp";

function parseSSEContent(text: string): string {
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

async function callMCPTool(toolName: string, args: Record<string, unknown>): Promise<string> {
  const initResp = await fetch(QUOTE_MCP_URL, {
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
  await initResp.text();

  const baseHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  if (sessionId) baseHeaders["mcp-session-id"] = sessionId;

  fetch(QUOTE_MCP_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(sessionId ? { "mcp-session-id": sessionId } : {}) },
    body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} }),
  }).catch(() => { /* ignore */ });

  const toolResp = await fetch(QUOTE_MCP_URL, {
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

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface Env {}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const body = (await context.request.json()) as {
      toolName: string;
      args: Record<string, unknown>;
    };

    const { toolName, args } = body;
    const allowed = new Set(["get_home_quote", "get_motor_quote", "get_pet_quote"]);
    if (!allowed.has(toolName)) {
      return new Response(JSON.stringify({ error: "Invalid tool" }), { status: 400 });
    }

    const output = await callMCPTool(toolName, args);
    const quote = parseQuoteResult(toolName, output);

    if (!quote) {
      return new Response(JSON.stringify({ error: "Failed to parse quote" }), { status: 502 });
    }

    return new Response(JSON.stringify({ quote }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
