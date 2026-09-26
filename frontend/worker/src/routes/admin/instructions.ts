/**
 * /admin/api/instructions — CRUD for the broker's standing instructions
 * (broker_instructions, migration 014), used by /admin/instructions.
 *
 *   GET                                  → all instructions, in prompt order
 *   POST   { text }                      → add (enabled, appended last)
 *   PATCH  { id, text?, enabled?, sort? } → edit
 *   DELETE { id }                        → remove
 *
 * Not gated in the Worker: during beta, Cloudflare Access gates the whole
 * of broker.denney.insure to the team (and workers.dev / preview URLs are
 * disabled), so only team members can reach /admin/*. Revisit when Access is
 * narrowed for launch — these change the prompt for every business.
 */
import type { Env } from "../../index";
import { supabaseAdmin } from "../../lib/supabase";
import { isUuid } from "../../lib/chat-store";

const MAX_LENGTH = 2000;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

export async function handleAdminInstructions(request: Request, env: Env): Promise<Response> {
  // Set by Cloudflare Access at the edge — used for attribution only
  const adminEmail = request.headers.get("Cf-Access-Authenticated-User-Email");

  const supabase = supabaseAdmin(env);
  const table = supabase.from("broker_instructions");

  if (request.method === "GET") {
    const { data, error } = await table
      .select("id, text, enabled, sort, created_by, created_at, updated_at")
      .order("sort", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) return json({ error: error.message }, 500);
    return json(data ?? []);
  }

  const body = (await request.json().catch(() => ({}))) as {
    id?: string;
    text?: unknown;
    enabled?: unknown;
    sort?: unknown;
  };

  if (request.method === "POST") {
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!text || text.length > MAX_LENGTH) return json({ error: `text is required (max ${MAX_LENGTH} chars)` }, 400);
    const { data: last } = await supabase
      .from("broker_instructions")
      .select("sort")
      .order("sort", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { data, error } = await table
      .insert({ text, sort: (last?.sort ?? 0) + 1, created_by: adminEmail })
      .select()
      .single();
    if (error) return json({ error: error.message }, 500);
    return json(data, 201);
  }

  if (!isUuid(body.id)) return json({ error: "id is required" }, 400);

  if (request.method === "PATCH") {
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.text !== undefined) {
      const text = typeof body.text === "string" ? body.text.trim() : "";
      if (!text || text.length > MAX_LENGTH) return json({ error: `text must be 1–${MAX_LENGTH} chars` }, 400);
      updates.text = text;
    }
    if (body.enabled !== undefined) {
      if (typeof body.enabled !== "boolean") return json({ error: "enabled must be a boolean" }, 400);
      updates.enabled = body.enabled;
    }
    if (body.sort !== undefined) {
      if (!Number.isInteger(body.sort)) return json({ error: "sort must be an integer" }, 400);
      updates.sort = body.sort;
    }
    const { data, error } = await table.update(updates).eq("id", body.id).select().maybeSingle();
    if (error) return json({ error: error.message }, 500);
    if (!data) return json({ error: "Not found" }, 404);
    return json(data);
  }

  if (request.method === "DELETE") {
    const { error } = await table.delete().eq("id", body.id);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  return json({ error: "Method not allowed" }, 405);
}
