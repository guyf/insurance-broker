/**
 * DELETE /api/delete-policy
 * Proxies delete requests to the Railway mcp-server /delete-policy endpoint.
 * Body: { source_paths: string[] }
 */
import type { Env } from "../index";
import { requireBusiness, unauthorizedResponse, withRefreshedCookie } from "../auth/require";

const DELETE_URL =
  "https://insurance-broker-production-85e3.up.railway.app/delete-policy";

export async function handleDeletePolicy(request: Request, env: Env): Promise<Response> {
  const auth = await requireBusiness(request, env);
  if (!auth) return unauthorizedResponse();

  try {
    const body = await request.json() as Record<string, unknown>;
    // Server-derived, never trust a client-supplied business_id even if one were sent.
    // NOTE: mcp-server accepts this but doesn't yet enforce that the source_paths
    // actually belong to this business — see CLAUDE.md's SME Rebuild "what's next".
    body.business_id = auth.businessId;

    const resp = await fetch(DELETE_URL, {
      method: "DELETE",
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
      JSON.stringify({ error: err instanceof Error ? err.message : "Delete failed" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
