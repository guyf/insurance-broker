/**
 * GET /api/policies
 * Calls list_policies + get_renewal_calendar on the Railway mcp-server,
 * merges the results, and returns a structured Policy[] JSON array.
 */

const BROKER_MCP_URL =
  "https://insurance-broker-production-85e3.up.railway.app/mcp";

interface Policy {
  doc_type: string | null;
  policy_type: string;
  insured_entity: string | null;
  filename: string;
  source_path: string;
  renewal_date: string | null;
  premium: string | null;
  provider: string | null;
  underwriter: string | null;
  asset_name: string | null;
  asset_value: string | null;
}

// ---------------------------------------------------------------------------
// Minimal MCP client
// ---------------------------------------------------------------------------

function parseSSEContent(text: string): string {
  try {
    const msg = JSON.parse(text) as {
      result?: { content?: Array<{ type: string; text?: string }> };
    };
    if (msg.result?.content) {
      return msg.result.content
        .filter((c) => c.type === "text" && c.text)
        .map((c) => c.text!)
        .join("\n");
    }
  } catch {
    // try SSE
  }
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data: ")) continue;
    const data = trimmed.slice(6);
    if (!data || data === "[DONE]") continue;
    try {
      const msg = JSON.parse(data) as {
        result?: { content?: Array<{ type: string; text?: string }> };
      };
      if (msg.result?.content) {
        return msg.result.content
          .filter((c) => c.type === "text" && c.text)
          .map((c) => c.text!)
          .join("\n");
      }
    } catch {
      // ignore parse errors
    }
  }
  return text;
}

async function callBrokerTool(toolName: string): Promise<string> {
  const initResp = await fetch(BROKER_MCP_URL, {
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

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  if (sessionId) headers["mcp-session-id"] = sessionId;

  const resp = await fetch(BROKER_MCP_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "tools/call",
      params: { name: toolName, arguments: {} },
      id: 1,
    }),
  });
  return parseSSEContent(await resp.text());
}

// ---------------------------------------------------------------------------
// Parsers for the text output from mcp-server tools
// ---------------------------------------------------------------------------

function tag(line: string, key: string): string | null {
  const m = line.match(new RegExp(`\\[${key}:\\s*([^\\]]+?)\\]`));
  return m ? m[1].trim() : null;
}

function parsePolicies(text: string): Policy[] {
  // Format: "  type [insured_entity] — filename  (source_path)  [doc_type: X] ..."
  // Split on the two-space gap before "(source_path)" so parens inside either the
  // entity or the path don't confuse a single regex.
  const policies: Policy[] = [];
  for (const line of text.split("\n")) {
    if (!line.match(/^\s+\S/)) continue;

    const splitIdx = line.search(/\s{2,}\(/);
    if (splitIdx === -1) continue;

    const leftPart = line.slice(0, splitIdx).trim();   // "type [entity] — filename"
    const rightPart = line.slice(splitIdx).trim();     // "(source_path)  [tags...]"

    // source_path: grab from first "(" to last ")" before the tags
    const spMatch = rightPart.match(/^\((.+)\)/);
    if (!spMatch) continue;
    const source_path = spMatch[1].trim();

    // Split "type [entity] — filename" on first " — "
    const dashIdx = leftPart.indexOf(" — ");
    if (dashIdx === -1) continue;
    const typeEntityPart = leftPart.slice(0, dashIdx);
    const filename = leftPart.slice(dashIdx + 3).trim();

    // Extract policy_type and optional insured_entity from typeEntityPart
    const teMatch = typeEntityPart.match(/^([\w/.-]+)(?:\s+\[(.+)\])?$/);
    if (!teMatch) continue;

    policies.push({
      doc_type: tag(line, "doc_type"),
      policy_type: teMatch[1],
      insured_entity: teMatch[2] ?? null,
      filename,
      source_path,
      renewal_date: tag(line, "renewal_date"),
      premium: tag(line, "premium"),
      provider: tag(line, "provider"),
      underwriter: tag(line, "underwriter"),
      asset_name: tag(line, "asset_name"),
      asset_value: tag(line, "asset_value"),
    });
  }
  return policies;
}

function parseRenewalCalendar(
  text: string
): Map<string, { renewal_date: string; premium: string | null }> {
  // Format: "  type [property] — date  £premium/yr — filename  ⚠️..."
  const map = new Map<string, { renewal_date: string; premium: string | null }>();
  for (const line of text.split("\n")) {
    if (!line.match(/^\s+\w/)) continue;
    const m = line.match(
      /^\s+\w+(?:\s+\[.*?\])?\s+—\s+(\S+)(?:\s+£([\d,]+)\/yr)?\s+—\s+(.+?)(?:\s+⚠️.*)?$/
    );
    if (!m) continue;
    const filename = m[3].trim();
    map.set(filename, {
      renewal_date: m[1],
      premium: m[2] ?? null,
    });
  }
  return map;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export const onRequestGet: PagesFunction = async () => {
  try {
    const [policiesText, renewalText] = await Promise.all([
      callBrokerTool("list_policies"),
      callBrokerTool("get_renewal_calendar"),
    ]);

    const policies = parsePolicies(policiesText);
    const renewalMap = parseRenewalCalendar(renewalText);

    // Merge renewal data into policies
    for (const policy of policies) {
      const renewal = renewalMap.get(policy.filename);
      if (renewal) {
        policy.renewal_date = renewal.renewal_date;
        policy.premium = renewal.premium;
      }
    }

    return new Response(JSON.stringify(policies), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Policies function error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
