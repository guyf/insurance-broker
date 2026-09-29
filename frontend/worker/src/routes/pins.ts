/**
 * GET    /api/pins       — the business's pinned answers, newest first
 * POST   /api/pins       — { message_id, content } pin an assistant reply
 * DELETE /api/pins/:id   — unpin
 *
 * Scoped to the business derived from the session. Pinning checks that the
 * message belongs to one of the business's chat sessions.
 */
import type { Env } from "../index";
import { requireBusiness, unauthorizedResponse, withRefreshedCookie } from "../auth/require";
import { supabaseAdmin } from "../lib/supabase";
import { getOwnedSession, isUuid } from "../lib/chat-store";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** First meaningful line of the reply, stripped of markdown, as a label. */
function titleFor(content: string): string {
  const line = content
    .split("\n")
    .map((l) => l.replace(/^[#>*\-\s\d.]+/, "").replace(/[*_`|]/g, "").trim())
    .find((l) => l.length > 0);
  const t = line ?? "Pinned answer";
  return t.length > 80 ? `${t.slice(0, 79).trimEnd()}…` : t;
}

export async function handlePins(request: Request, env: Env, pinId?: string): Promise<Response> {
  const auth = await requireBusiness(request, env);
  if (!auth) return unauthorizedResponse();
  const supabase = supabaseAdmin(env);
  const reply = (res: Response) => withRefreshedCookie(res, auth.refreshedCookie);

  if (request.method === "GET") {
    const { data, error } = await supabase
      .from("pinned_insights")
      .select("id, message_id, title, content, created_at")
      .eq("business_id", auth.businessId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) return json({ error: error.message }, 500);
    return reply(json(data ?? []));
  }

  if (request.method === "POST") {
    const body = (await request.json().catch(() => ({}))) as { message_id?: string; content?: string };
    const content = typeof body.content === "string" ? body.content.trim().slice(0, 20000) : "";
    if (!isUuid(body.message_id) || !content) return json({ error: "message_id and content are required" }, 400);

    const { data: message } = await supabase
      .from("chat_messages")
      .select("id, kind, session_id")
      .eq("id", body.message_id)
      .maybeSingle();
    const owned = message && message.kind === "assistant"
      ? await getOwnedSession(env, message.session_id, auth.businessId)
      : null;
    if (!owned) return json({ error: "Message not found" }, 404);

    const { data, error } = await supabase
      .from("pinned_insights")
      .upsert(
        { business_id: auth.businessId, message_id: body.message_id, title: titleFor(content), content },
        { onConflict: "business_id,message_id" },
      )
      .select("id, message_id, title, content, created_at")
      .single();
    if (error) return json({ error: error.message }, 500);
    return reply(json(data));
  }

  if (request.method === "DELETE" && isUuid(pinId)) {
    const { error } = await supabase
      .from("pinned_insights")
      .delete()
      .eq("id", pinId)
      .eq("business_id", auth.businessId);
    if (error) return json({ error: error.message }, 500);
    return reply(json({ ok: true }));
  }

  return json({ error: "Not found" }, 404);
}
