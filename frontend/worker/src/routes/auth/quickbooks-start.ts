/**
 * GET /api/auth/quickbooks-start
 * Kicks off the QuickBooks OAuth dance. Works both as a login entry point
 * (no existing session) and as "connect QuickBooks" for an already-logged-in
 * user — quickbooks-callback.ts decides which by checking for a session at
 * that point. Mirrors xero-start.ts.
 */
import type { Env } from "../../index";
import { quickbooksAuthUrl } from "../../auth/oauth-quickbooks";

const STATE_COOKIE = "quickbooks_oauth_state";

export async function handleQuickbooksStart(request: Request, env: Env): Promise<Response> {
  const state = crypto.randomUUID();
  const redirectUri = new URL("/api/auth/quickbooks-callback", request.url).toString();

  return new Response(null, {
    status: 302,
    headers: {
      Location: quickbooksAuthUrl(env, state, redirectUri),
      // Short-lived — only needs to survive the round trip to Intuit and back.
      // Checked against the `state` query param on callback to prevent CSRF.
      "Set-Cookie": `${STATE_COOKIE}=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=300`,
    },
  });
}
