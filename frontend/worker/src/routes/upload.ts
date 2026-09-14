/**
 * POST /api/upload
 * Proxies multipart PDF upload to the Railway mcp-server /upload endpoint.
 * Body: multipart/form-data with a "file" field.
 */
import type { Env } from "../index";
import { requireBusiness, unauthorizedResponse, withRefreshedCookie } from "../auth/require";

const UPLOAD_URL =
  "https://insurance-broker-production-85e3.up.railway.app/upload";

export async function handleUpload(request: Request, env: Env): Promise<Response> {
  const auth = await requireBusiness(request, env);
  if (!auth) return unauthorizedResponse();

  try {
    const contentType = request.headers.get("content-type") ?? "";
    const body = await request.arrayBuffer();

    // business_id travels as a query param rather than a form field — the
    // multipart body is forwarded byte-for-byte without being parsed, and
    // mcp-server's /upload already reads query params for scoping.
    const target = new URL(UPLOAD_URL);
    target.searchParams.set("business_id", auth.businessId);

    const resp = await fetch(target.toString(), {
      method: "POST",
      headers: { "Content-Type": contentType },
      body,
    });

    const text = await resp.text();
    return withRefreshedCookie(
      new Response(text, { status: resp.status, headers: { "Content-Type": "application/json" } }),
      auth.refreshedCookie
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Upload failed" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
