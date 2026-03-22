/**
 * POST /api/upload
 * Proxies a PDF file to the Railway mcp-server /upload endpoint.
 */

const UPLOAD_URL =
  "https://insurance-broker-production-85e3.up.railway.app/upload";

export const onRequestPost: PagesFunction = async (context) => {
  try {
    const formData = await context.request.formData();

    // Forward the multipart form as-is to the Railway server
    const resp = await fetch(UPLOAD_URL, {
      method: "POST",
      body: formData,
    });

    const body = await resp.text();

    return new Response(body, {
      status: resp.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Upload proxy error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Upload failed" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
