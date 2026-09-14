/**
 * GET /api/policies
 * Proxies mcp-server's /list-policies HTTP endpoint directly — its RPC
 * already returns doc_type/policy_type/policy_types/premium/renewal_date
 * etc. in one row, so there's no need for the MCP-tool-text-then-regex
 * round trip the old implementation did (which also couldn't surface
 * policy_types, needed for the coverage checklist's risk tagging).
 */
import type { Env } from "../index";
import { requireBusiness, unauthorizedResponse, withRefreshedCookie } from "../auth/require";

const BROKER_HTTP_BASE = "https://insurance-broker-production-85e3.up.railway.app";

export async function handlePolicies(request: Request, env: Env): Promise<Response> {
  const auth = await requireBusiness(request, env);
  if (!auth) return unauthorizedResponse();

  try {
    const resp = await fetch(
      `${BROKER_HTTP_BASE}/list-policies?business_id=${encodeURIComponent(auth.businessId)}`
    );
    const policies = resp.ok ? await resp.json() : [];

    return withRefreshedCookie(
      new Response(JSON.stringify(policies), { headers: { "Content-Type": "application/json" } }),
      auth.refreshedCookie
    );
  } catch (err) {
    console.error("Policies route error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
