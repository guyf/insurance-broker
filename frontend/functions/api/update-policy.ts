/**
 * PATCH /api/update-policy
 * Proxies metadata updates to the Railway mcp-server /update-policy endpoint.
 * Body: { source_paths: string[], updates: Record<string, string> }
 */

const UPDATE_URL =
  "https://insurance-broker-production-85e3.up.railway.app/update-policy";

export const onRequestPatch: PagesFunction = async (context) => {
  try {
    const body = await context.request.json();
    const resp = await fetch(UPDATE_URL, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await resp.text();
    return new Response(text, {
      status: resp.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Update failed" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
