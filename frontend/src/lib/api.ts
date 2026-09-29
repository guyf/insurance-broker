import type { ChatMessage, ChatResponse, ChatSessionSummary, CoverageAnalysis, IdentifyResult, PinnedInsight, Policy, QuoteResult } from "./types";

export interface ChatStreamHandlers {
  /** The session this turn belongs to — sent first, before any reply text. */
  onSession?: (sessionId: string) => void;
  /** What the broker is doing right now, e.g. "Searching your policies…". */
  onStatus?: (text: string) => void;
  /** The next piece of reply text. */
  onText?: (delta: string) => void;
}

/**
 * Sends one new message; the server holds the history. Omit sessionId to
 * start a new session. `notes` are assistant messages the UI showed outside
 * the chat (e.g. Analyse Policies summaries) so the broker sees them too.
 *
 * The reply arrives as a Server-Sent Events stream (see handleChat in
 * worker/src/routes/chat.ts): session / status / text events as it's
 * produced, pings to keep the connection alive, then a final "done" event
 * whose payload this resolves with.
 */
export async function sendMessage(
  sessionId: string | null,
  message: string,
  notes: string[] = [],
  handlers: ChatStreamHandlers = {}
): Promise<ChatResponse> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify({ session_id: sessionId ?? undefined, message, notes }),
  });
  if (!res.ok || !res.body) {
    const err = await res.text().catch(() => "Unknown error");
    throw new Error(`Chat failed: ${err}`);
  }

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let boundary: number;
    while ((boundary = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const data = frame
        .split("\n")
        .filter((line) => line.startsWith("data: "))
        .map((line) => line.slice(6))
        .join("\n");
      if (!data) continue;
      const event = JSON.parse(data) as
        | { type: "ping" }
        | { type: "session"; session_id: string }
        | { type: "status"; text: string }
        | { type: "text"; delta: string }
        | ({ type: "done" } & ChatResponse)
        | { type: "error"; error: string };
      switch (event.type) {
        case "session":
          handlers.onSession?.(event.session_id);
          break;
        case "status":
          handlers.onStatus?.(event.text);
          break;
        case "text":
          handlers.onText?.(event.delta);
          break;
        case "error":
          throw new Error(event.error);
        case "done": {
          reader.cancel().catch(() => {});
          const { type: _type, ...response } = event;
          return response;
        }
      }
    }
  }
  throw new Error("The connection was interrupted before the broker finished replying.");
}

export async function listChatSessions(): Promise<ChatSessionSummary[]> {
  const res = await fetch("/api/chat/sessions");
  if (!res.ok) throw new Error("Failed to list chat sessions");
  return res.json();
}

export async function getChatSession(id: string): Promise<{ session: ChatSessionSummary; messages: ChatMessage[] }> {
  const res = await fetch(`/api/chat/sessions/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error("Failed to load chat session");
  return res.json();
}

export async function sendChatFeedback(messageId: string, rating: 1 | -1, comment?: string): Promise<void> {
  const res = await fetch("/api/chat/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message_id: messageId, rating, comment }),
  });
  if (!res.ok) throw new Error("Failed to save feedback");
}

export async function fetchPolicies(): Promise<Policy[]> {
  const res = await fetch("/api/policies");
  if (!res.ok) throw new Error("Failed to fetch policies");
  return res.json() as Promise<Policy[]>;
}

export async function updatePolicyMetadata(
  sourcePaths: string[],
  updates: Record<string, string>
): Promise<void> {
  const res = await fetch("/api/update-policy", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source_paths: sourcePaths, updates }),
  });
  if (!res.ok) throw new Error("Failed to update policy metadata");
}

export async function deletePolicy(sourcePaths: string[]): Promise<void> {
  const res = await fetch("/api/delete-policy", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source_paths: sourcePaths }),
  });
  if (!res.ok) throw new Error("Failed to delete policy");
}

export async function requote(toolName: string, args: Record<string, unknown>): Promise<QuoteResult> {
  const res = await fetch("/api/requote", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ toolName, args }),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "Unknown error");
    throw new Error(`Requote failed: ${err}`);
  }
  return (await res.json() as { quote: QuoteResult }).quote;
}

export async function uploadPolicy(
  file: File,
  sourceFolder?: string
): Promise<{ status: string; chunks: number; filename: string }> {
  const fd = new FormData();
  fd.append("file", file);
  if (sourceFolder) fd.append("source_folder", sourceFolder);
  const res = await fetch("/api/upload", { method: "POST", body: fd });
  if (!res.ok) {
    const err = await res.text().catch(() => "Upload failed");
    throw new Error(err);
  }
  return res.json();
}

export async function identifyPolicy(filename: string): Promise<IdentifyResult> {
  const res = await fetch("/api/identify-policy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename }),
  });
  if (!res.ok) throw new Error("Failed to identify policy");
  return res.json();
}

export async function getCoverageAnalysis(): Promise<CoverageAnalysis> {
  const res = await fetch("/api/coverage-analysis");
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? "Failed to fetch coverage analysis");
  }
  return res.json();
}

export async function refreshCoverageAnalysis(): Promise<CoverageAnalysis> {
  const res = await fetch("/api/analyse-policies", { method: "POST" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? "Failed to analyse policies");
  }
  return res.json();
}

export async function listPins(): Promise<PinnedInsight[]> {
  const res = await fetch("/api/pins");
  if (!res.ok) throw new Error("Failed to load pinned answers");
  return res.json();
}

export async function pinMessage(messageId: string, content: string): Promise<PinnedInsight> {
  const res = await fetch("/api/pins", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message_id: messageId, content }),
  });
  if (!res.ok) throw new Error("Failed to pin answer");
  return res.json();
}

export async function unpin(id: string): Promise<void> {
  const res = await fetch(`/api/pins/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to unpin answer");
}
