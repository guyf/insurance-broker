/**
 * /admin/api/businesses — inspect and reset per-business data, used by /admin/businesses.
 *
 *   GET                                   → every business with its owner and entity counts
 *   DELETE { business_id, entity }        → wipe one entity type for one business
 *                                           entity: "documents" | "chats" | "coverage" | "pins"
 *
 * For resetting test accounts. The delete is destructive and irreversible, and like the other
 * /admin/api routes it is NOT gated in the Worker — during beta Cloudflare Access gates the whole
 * domain to the team. When Access is narrowed to /admin* for launch, add a Worker-side check
 * (verify the Cf-Access-Jwt-Assertion JWT) before this stays reachable.
 */
import type { Env } from "../../index";
import { supabaseAdmin } from "../../lib/supabase";
import { isUuid } from "../../lib/chat-store";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const ENTITIES = ["documents", "chats", "coverage", "pins"] as const;
type Entity = (typeof ENTITIES)[number];

export async function handleAdminBusinesses(request: Request, env: Env): Promise<Response> {
  const supabase = supabaseAdmin(env);

  if (request.method === "GET") {
    const { data: businesses, error } = await supabase
      .from("businesses")
      .select("id, name, owner_user_id, created_at")
      .order("created_at", { ascending: false });
    if (error) return json({ error: error.message }, 500);

    const rows = await Promise.all(
      (businesses ?? []).map(async (b) => {
        const [owner, docs, sessions, coverage, pins] = await Promise.all([
          supabase.auth.admin.getUserById(b.owner_user_id),
          supabase.rpc("list_policies", { p_business_id: b.id }),
          supabase.from("chat_sessions").select("id", { count: "exact", head: true }).eq("business_id", b.id),
          supabase.from("coverage_analysis").select("analysis").eq("business_id", b.id).maybeSingle(),
          supabase.from("pinned_insights").select("id", { count: "exact", head: true }).eq("business_id", b.id),
        ]);
        return {
          id: b.id,
          name: b.name,
          owner_email: owner.data?.user?.email ?? null,
          created_at: b.created_at,
          counts: {
            documents: Array.isArray(docs.data) ? docs.data.length : 0,
            chats: sessions.count ?? 0,
            // number of risks in the saved analysis
            coverage: Object.keys((coverage.data?.analysis as Record<string, unknown> | undefined) ?? {}).length,
            pins: pins.count ?? 0,
          },
        };
      }),
    );
    return json(rows);
  }

  if (request.method === "DELETE") {
    const body = (await request.json().catch(() => ({}))) as { business_id?: string; entity?: string };
    if (!isUuid(body.business_id) || !ENTITIES.includes(body.entity as Entity)) {
      return json({ error: "business_id and a valid entity are required" }, 400);
    }
    const id = body.business_id;

    // chat_messages / chat_feedback go with their session (ON DELETE CASCADE)
    const table: Record<Entity, string> = {
      documents: "documents",
      chats: "chat_sessions",
      coverage: "coverage_analysis",
      pins: "pinned_insights",
    };
    const { error } = await supabase.from(table[body.entity as Entity]).delete().eq("business_id", id);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  return json({ error: "Method not allowed" }, 405);
}
