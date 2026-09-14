/**
 * Minimal stateless MCP (streamable-http) client, shared by the chat,
 * policies and requote routes — extracted here now that all three run in
 * the same Worker (previously duplicated per-file because each Cloudflare
 * Pages Function was bundled in isolation).
 */

export function parseSSEContent(text: string): string {
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

export async function callMCPTool(
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
