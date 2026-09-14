/**
 * GET /api/coverage-analysis
 * Returns the persisted per-risk coverage analysis for the caller's
 * business (from the coverage_analysis table via mcp-server), or {} if
 * "Analyse Policies" (POST /api/analyse-policies) has never been run.
 */
import type { Env } from "../index";
import { requireBusiness, unauthorizedResponse, withRefreshedCookie } from "../auth/require";

const BROKER_HTTP_BASE = "https://insurance-broker-production-85e3.up.railway.app";

export async function handleGetCoverageAnalysis(request: Request, env: Env): Promise<Response> {
  const auth = await requireBusiness(request, env);
  if (!auth) return unauthorizedResponse();

  try {
    const resp = await fetch(
      `${BROKER_HTTP_BASE}/coverage-analysis?business_id=${encodeURIComponent(auth.businessId)}`
    );
    const analysis = resp.ok ? await resp.json() : {};
    return withRefreshedCookie(
      new Response(JSON.stringify(analysis), { headers: { "Content-Type": "application/json" } }),
      auth.refreshedCookie
    );
  } catch {
    return new Response(JSON.stringify({}), { headers: { "Content-Type": "application/json" } });
  }
}
