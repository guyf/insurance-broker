/**
 * GET /api/auth/xero-callback
 * Exchanges the auth code, links or logs in the business, upserts the
 * connection + a fresh financials snapshot, and redirects into the app.
 */
import type { Env } from "../../index";
import { parseCookies, sessionCookieHeader } from "../../auth/session";
import { requireBusiness } from "../../auth/require";
import { bridgeEmailToSession } from "../../auth/bridge";
import { getOrCreateBusinessForUser } from "../../auth/business";
import { supabaseAdmin } from "../../lib/supabase";
import {
  xeroExchangeCode,
  xeroGetTenantId,
  decodeXeroIdTokenEmail,
} from "../../auth/oauth-xero";
import { fetchXeroFinancials } from "../../auth/xero-data";

const STATE_COOKIE = "xero_oauth_state";

function errorRedirect(origin: string, reason: string): Response {
  return Response.redirect(new URL(`/?auth_error=${reason}`, origin).toString(), 302);
}

export async function handleXeroCallback(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieState = parseCookies(request)[STATE_COOKIE];

  if (!code || !state || !cookieState || state !== cookieState) {
    return errorRedirect(url.origin, "xero_state_mismatch");
  }

  try {
    const redirectUri = new URL("/api/auth/xero-callback", request.url).toString();
    const tokens = await xeroExchangeCode(env, code, redirectUri);
    const tenantId = await xeroGetTenantId(tokens.access_token);

    // Already logged in? Treat this as "connect Xero" for the existing
    // business rather than creating/bridging a new login.
    const existingAuth = await requireBusiness(request, env);

    let businessId: string;
    let sessionCookie: string | null = null;

    if (existingAuth) {
      businessId = existingAuth.businessId;
      sessionCookie = existingAuth.refreshedCookie;
    } else {
      const email = decodeXeroIdTokenEmail(tokens.id_token ?? "");
      if (!email) return errorRedirect(url.origin, "xero_no_email");

      const bridged = await bridgeEmailToSession(env, email);
      businessId = await getOrCreateBusinessForUser(supabaseAdmin(env), bridged.userId);
      sessionCookie = sessionCookieHeader({
        access_token: bridged.accessToken,
        refresh_token: bridged.refreshToken,
      });
    }

    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
    const connectionRow = {
      business_id: businessId,
      provider: "xero",
      external_tenant_id: tenantId,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expires_at: expiresAt,
      connected_at: new Date().toISOString(),
    };
    await supabaseAdmin(env)
      .from("business_connections")
      .upsert(connectionRow, { onConflict: "business_id,provider" });

    const financials = await fetchXeroFinancials(tokens.access_token, tenantId);
    await supabaseAdmin(env)
      .from("business_financials")
      .upsert(
        {
          business_id: businessId,
          source: "xero",
          revenue: financials.revenue,
          employees: financials.employees,
          fixed_assets: financials.fixedAssets,
          payroll: null,
          industry: null,
          raw: financials.raw,
          fetched_at: new Date().toISOString(),
        },
        { onConflict: "business_id" }
      );

    // Two Set-Cookie headers needed (clear the state cookie, set the session one) —
    // Headers.append lets both coexist, which a plain object literal couldn't.
    const responseHeaders = new Headers({ Location: "/" });
    responseHeaders.append("Set-Cookie", `${STATE_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
    if (sessionCookie) responseHeaders.append("Set-Cookie", sessionCookie);

    return new Response(null, { status: 302, headers: responseHeaders });
  } catch (err) {
    console.error("Xero callback error:", err);
    return errorRedirect(url.origin, "xero_callback_failed");
  }
}
