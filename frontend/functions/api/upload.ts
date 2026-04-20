/**
 * POST /api/upload
 * Proxies multipart PDF upload to the Railway mcp-server /upload endpoint.
 * Body: multipart/form-data with a "file" field.
 */

const UPLOAD_URL =
  "https://insurance-broker-production-85e3.up.railway.app/upload";

export const onRequestPost: PagesFunction = async (context) => {
  try {
    const contentType = context.request.headers.get("content-type") ?? "";
    const body = await context.request.arrayBuffer();

    const resp = await fetch(UPLOAD_URL, {
      method: "POST",
      headers: { "Content-Type": contentType },
      body,
    });

    const text = await resp.text();
    return new Response(text, {
      status: resp.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Upload failed" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
