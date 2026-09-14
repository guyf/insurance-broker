/**
 * GET /api/auth/quickbooks-callback
 * Exchanges the auth code, links or logs in the business, upserts the
 * connection + a fresh financials snapshot, and redirects into the app.
 * Mirrors xero-callback.ts — the one structural difference is that
 * QuickBooks hands back the company id (`realmId`) directly as a callback
 * query param instead of requiring a separate connections lookup.
 */
import type { Env } from "../../index";
import { parseCookies, sessionCookieHeader } from "../../auth/session";
import { requireBusiness } from "../../auth/require";
import { bridgeEmailToSession } from "../../auth/bridge";
import { getOrCreateBusinessForUser } from "../../auth/business";
import { supabaseAdmin } from "../../lib/supabase";
import { quickbooksExchangeCode } from "../../auth/oauth-quickbooks";
import { decodeIdTokenEmail } from "../../auth/jwt";
import { fetchQuickBooksFinancials } from "../../auth/quickbooks-data";

const STATE_COOKIE = "quickbooks_oauth_state";

function errorRedirect(origin: string, reason: string): Response {
  return Response.redirect(new URL(`/?auth_error=${reason}`, origin).toString(), 302);
}

export async function handleQuickbooksCallback(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const realmId = url.searchParams.get("realmId");
  const cookieState = parseCookies(request)[STATE_COOKIE];

  if (!code || !state || !cookieState || state !== cookieState) {
    return errorRedirect(url.origin, "quickbooks_state_mismatch");
  }
  if (!realmId) return errorRedirect(url.origin, "quickbooks_no_realm");

  try {
    const redirectUri = new URL("/api/auth/quickbooks-callback", request.url).toString();
    const tokens = await quickbooksExchangeCode(env, code, redirectUri);

    // Already logged in? Treat this as "connect QuickBooks" for the existing
    // business rather than creating/bridging a new login.
    const existingAuth = await requireBusiness(request, env);

    let businessId: string;
    let sessionCookie: string | null = null;

    if (existingAuth) {
      businessId = existingAuth.businessId;
      sessionCookie = existingAuth.refreshedCookie;
    } else {
      const email = decodeIdTokenEmail(tokens.id_token ?? "");
      if (!email) return errorRedirect(url.origin, "quickbooks_no_email");

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
      provider: "quickbooks",
      external_tenant_id: realmId,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expires_at: expiresAt,
      connected_at: new Date().toISOString(),
    };
    await supabaseAdmin(env)
      .from("business_connections")
      .upsert(connectionRow, { onConflict: "business_id,provider" });

    const financials = await fetchQuickBooksFinancials(env.QUICKBOOKS_API_BASE, tokens.access_token, realmId);
    await supabaseAdmin(env)
      .from("business_financials")
      .upsert(
        {
          business_id: businessId,
          source: "quickbooks",
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

    // Only fills in a name if one isn't already set — never overwrites a
    // name the user entered themselves (e.g. on the business card).
    if (financials.name && financials.name !== "Unknown Organisation") {
      await supabaseAdmin(env)
        .from("businesses")
        .update({ name: financials.name, updated_at: new Date().toISOString() })
        .eq("id", businessId)
        .is("name", null);
    }

    // Two Set-Cookie headers needed (clear the state cookie, set the session one) —
    // Headers.append lets both coexist, which a plain object literal couldn't.
    const responseHeaders = new Headers({ Location: "/" });
    responseHeaders.append("Set-Cookie", `${STATE_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
    if (sessionCookie) responseHeaders.append("Set-Cookie", sessionCookie);

    return new Response(null, { status: 302, headers: responseHeaders });
  } catch (err) {
    console.error("QuickBooks callback error:", err);
    return errorRedirect(url.origin, "quickbooks_callback_failed");
  }
}
