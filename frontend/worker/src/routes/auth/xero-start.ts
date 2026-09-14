/**
 * GET /api/auth/xero-start
 * Kicks off the Xero OAuth dance. Works both as a login entry point (no
 * existing session) and as "connect Xero" for an already-logged-in user —
 * xero-callback.ts decides which by checking for a session at that point.
 */
import type { Env } from "../../index";
import { xeroAuthUrl } from "../../auth/oauth-xero";

const STATE_COOKIE = "xero_oauth_state";

export async function handleXeroStart(request: Request, env: Env): Promise<Response> {
  const state = crypto.randomUUID();
  const redirectUri = new URL("/api/auth/xero-callback", request.url).toString();

  return new Response(null, {
    status: 302,
    headers: {
      Location: xeroAuthUrl(env, state, redirectUri),
      // Short-lived — only needs to survive the round trip to Xero and back.
      // Checked against the `state` query param on callback to prevent CSRF
      // (xero-insurance's original flow generated state but never validated it).
      "Set-Cookie": `${STATE_COOKIE}=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=300`,
    },
  });
}
