/**
 * Persistence for broker chat sessions (chat_sessions / chat_messages /
 * chat_feedback, migration 013). The Worker is authoritative for history:
 * the client only ever sends a session_id plus its new message, and every
 * lookup here is scoped to the caller's business_id from the session.
 */
import type Anthropic from "@anthropic-ai/sdk";
import type { Env } from "../index";
import { supabaseAdmin } from "./supabase";

export type ChatMessageKind = "user" | "assistant" | "tool_call" | "tool_result" | "note";

export interface StoredChatMessage {
  id?: string;
  seq: number;
  role: "user" | "assistant";
  kind: ChatMessageKind;
  content: Anthropic.ContentBlockParam[];
  model?: string | null;
  prompt_version?: string | null;
  /** Standing instructions in force for this model turn (migration 014). */
  instructions?: string[] | null;
  input_tokens?: number | null;
  output_tokens?: number | null;
  latency_ms?: number | null;
  quote?: unknown;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/** Returns the session only if it belongs to businessId — otherwise null, same as not found. */
export async function getOwnedSession(env: Env, sessionId: string, businessId: string) {
  if (!isUuid(sessionId)) return null;
  const { data } = await supabaseAdmin(env)
    .from("chat_sessions")
    .select("id, title, created_at, updated_at")
    .eq("id", sessionId)
    .eq("business_id", businessId)
    .maybeSingle();
  return data;
}

export async function createSession(env: Env, businessId: string, userId: string, title: string): Promise<string> {
  const { data, error } = await supabaseAdmin(env)
    .from("chat_sessions")
    .insert({ business_id: businessId, user_id: userId, title })
    .select("id")
    .single();
  if (error || !data) throw new Error(`Failed to create chat session: ${error?.message}`);
  return data.id;
}

export async function loadHistory(env: Env, sessionId: string): Promise<StoredChatMessage[]> {
  const { data, error } = await supabaseAdmin(env)
    .from("chat_messages")
    .select("id, seq, role, kind, content, quote")
    .eq("session_id", sessionId)
    .order("seq", { ascending: true });
  if (error) throw new Error(`Failed to load chat history: ${error.message}`);
  return (data ?? []) as StoredChatMessage[];
}

/** Inserts rows and bumps the session's updated_at. Returns the inserted rows' ids by seq. */
export async function appendMessages(
  env: Env,
  sessionId: string,
  rows: StoredChatMessage[]
): Promise<Map<number, string>> {
  const supabase = supabaseAdmin(env);
  const { data, error } = await supabase
    .from("chat_messages")
    .insert(rows.map((r) => ({ ...r, session_id: sessionId })))
    .select("id, seq");
  if (error) throw new Error(`Failed to save chat messages: ${error.message}`);
  await supabase.from("chat_sessions").update({ updated_at: new Date().toISOString() }).eq("id", sessionId);
  return new Map((data ?? []).map((r) => [r.seq as number, r.id as string]));
}

/**
 * Converts stored rows into a valid Messages API history. Notes (assistant
 * text the UI showed outside the chat loop) become context on the following
 * user turn, and consecutive same-role turns are merged — e.g. a leftover
 * tool_result turn followed by a new user message — so roles always alternate.
 */
export function toModelMessages(rows: StoredChatMessage[]): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = [];
  for (const row of rows) {
    let role = row.role;
    let content = row.content;
    if (row.kind === "note") {
      role = "user";
      const text = content.map((b) => (b.type === "text" ? b.text : "")).join("\n");
      content = [{ type: "text", text: `[For context — the app showed me this message from you earlier:]\n${text}` }];
    }
    const prev = out[out.length - 1];
    if (prev && prev.role === role) {
      prev.content = [...(prev.content as Anthropic.ContentBlockParam[]), ...content];
    } else {
      out.push({ role, content: [...content] });
    }
  }
  return out;
}

/** Plain text of a stored row, for rendering in the UI. */
export function textOf(content: Anthropic.ContentBlockParam[]): string {
  return content.map((b) => (b.type === "text" ? b.text : "")).join("");
}
