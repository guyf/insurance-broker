/**
 * PATCH /api/update-policy
 * Proxies metadata updates to the Railway mcp-server /update-policy endpoint.
 * Body: { source_paths: string[], updates: Record<string, string> }
 */
import type { Env } from "../index";
import { requireBusiness, unauthorizedResponse, withRefreshedCookie } from "../auth/require";

const UPDATE_URL =
  "https://insurance-broker-production-85e3.up.railway.app/update-policy";

export async function handleUpdatePolicy(request: Request, env: Env): Promise<Response> {
  const auth = await requireBusiness(request, env);
  if (!auth) return unauthorizedResponse();

  try {
    const body = await request.json() as Record<string, unknown>;
    // Server-derived, never trust a client-supplied business_id even if one were sent.
    // NOTE: mcp-server accepts this but doesn't yet enforce that the source_paths
    // actually belong to this business — see CLAUDE.md's SME Rebuild "what's next".
    body.business_id = auth.businessId;

    const resp = await fetch(UPDATE_URL, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await resp.text();
    return withRefreshedCookie(
      new Response(text, { status: resp.status, headers: { "Content-Type": "application/json" } }),
      auth.refreshedCookie
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Update failed" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
