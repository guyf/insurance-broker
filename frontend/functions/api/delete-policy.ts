/**
 * DELETE /api/delete-policy
 * Proxies delete requests to the Railway mcp-server /delete-policy endpoint.
 * Body: { source_paths: string[] }
 */

const DELETE_URL =
  "https://insurance-broker-production-85e3.up.railway.app/delete-policy";

export const onRequestDelete: PagesFunction = async (context) => {
  try {
    const body = await context.request.json();
    const resp = await fetch(DELETE_URL, {
      method: "DELETE",
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
      JSON.stringify({ error: err instanceof Error ? err.message : "Delete failed" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
