/**
 * GET /api/business
 * Returns the current session's business, connected accounting providers,
 * and latest financials snapshot. 401 if not authenticated.
 */
import type { Env } from "../index";
import { readSession } from "../auth/session";
import { supabaseAdmin } from "../lib/supabase";

export async function handleGetBusiness(request: Request, env: Env): Promise<Response> {
  const session = await readSession(request, env);
  if (!session) {
    return new Response(JSON.stringify({ error: "Not authenticated" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = supabaseAdmin(env);
  const { data: business } = await supabase
    .from("businesses")
    .select("id, name, created_at")
    .eq("owner_user_id", session.user.id)
    .limit(1)
    .maybeSingle();

  const { data: connections } = business
    ? await supabase
        .from("business_connections")
        .select("provider, connected_at")
        .eq("business_id", business.id)
    : { data: [] };

  const { data: financials } = business
    ? await supabase
        .from("business_financials")
        .select("source, revenue, employees, fixed_assets, payroll, industry, fetched_at")
        .eq("business_id", business.id)
        .maybeSingle()
    : { data: null };

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (session.refreshedCookie) headers["Set-Cookie"] = session.refreshedCookie;

  return new Response(
    JSON.stringify({
      user: { email: session.user.email },
      business,
      connections: connections ?? [],
      financials,
    }),
    { headers }
  );
}
