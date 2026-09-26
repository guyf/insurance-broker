/**
 * GET  /api/chat/sessions       — the current business's chat sessions, newest first
 * GET  /api/chat/sessions/:id   — one session's user-visible messages (text + quote + rating)
 * POST /api/chat/feedback       — { message_id, rating: 1 | -1, comment? } on an assistant reply
 *
 * All scoped to the business derived from the session; a session or message
 * belonging to another business is reported as not found.
 */
import type { Env } from "../index";
import { requireBusiness, unauthorizedResponse, withRefreshedCookie } from "../auth/require";
import { supabaseAdmin } from "../lib/supabase";
import { getOwnedSession, isUuid, loadHistory, textOf } from "../lib/chat-store";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

export async function handleListChatSessions(request: Request, env: Env): Promise<Response> {
  const auth = await requireBusiness(request, env);
  if (!auth) return unauthorizedResponse();

  const { data, error } = await supabaseAdmin(env)
    .from("chat_sessions")
    .select("id, title, created_at, updated_at")
    .eq("business_id", auth.businessId)
    .order("updated_at", { ascending: false })
    .limit(50);
  if (error) return json({ error: error.message }, 500);

  return withRefreshedCookie(json(data ?? []), auth.refreshedCookie);
}

export async function handleGetChatSession(request: Request, env: Env, sessionId: string): Promise<Response> {
  const auth = await requireBusiness(request, env);
  if (!auth) return unauthorizedResponse();

  const session = await getOwnedSession(env, sessionId, auth.businessId);
  if (!session) return json({ error: "Chat session not found" }, 404);

  const rows = (await loadHistory(env, session.id)).filter(
    (r) => r.kind === "user" || r.kind === "assistant" || r.kind === "note"
  );

  const assistantIds = rows.filter((r) => r.kind === "assistant").map((r) => r.id!);
  const ratings = new Map<string, number>();
  if (assistantIds.length) {
    const { data } = await supabaseAdmin(env)
      .from("chat_feedback")
      .select("message_id, rating")
      .in("message_id", assistantIds);
    for (const f of data ?? []) ratings.set(f.message_id, f.rating);
  }

  const messages = rows.map((r) => ({
    id: r.kind === "assistant" ? r.id : undefined,
    role: r.role,
    content: textOf(r.content),
    quote: r.quote ?? undefined,
    rating: r.id ? ratings.get(r.id) : undefined,
  }));

  return withRefreshedCookie(json({ session, messages }), auth.refreshedCookie);
}

export async function handleChatFeedback(request: Request, env: Env): Promise<Response> {
  const auth = await requireBusiness(request, env);
  if (!auth) return unauthorizedResponse();

  const body = (await request.json().catch(() => ({}))) as {
    message_id?: string;
    rating?: number;
    comment?: string;
  };
  if (!isUuid(body.message_id) || (body.rating !== 1 && body.rating !== -1)) {
    return json({ error: "message_id and rating (1 or -1) are required" }, 400);
  }

  const supabase = supabaseAdmin(env);
  const { data: message } = await supabase
    .from("chat_messages")
    .select("id, kind, session_id")
    .eq("id", body.message_id)
    .maybeSingle();
  const owned = message && message.kind === "assistant"
    ? await getOwnedSession(env, message.session_id, auth.businessId)
    : null;
  if (!owned) return json({ error: "Message not found" }, 404);

  const { error } = await supabase.from("chat_feedback").upsert({
    message_id: body.message_id,
    rating: body.rating,
    comment: typeof body.comment === "string" && body.comment.trim() ? body.comment.trim().slice(0, 2000) : null,
    created_at: new Date().toISOString(),
  });
  if (error) return json({ error: error.message }, 500);

  return withRefreshedCookie(json({ ok: true }), auth.refreshedCookie);
}
