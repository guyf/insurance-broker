/**
 * GET /api/auth/link-verify?token_hash=...&type=...
 * Handles a clicked email link (magic link / confirm-signup), as an
 * alternative to typing the code into LoginGate. Verifies via token_hash
 * rather than relying on Supabase's own /auth/v1/verify redirect (which
 * hands session tokens back in a URL fragment or PKCE `code` param neither
 * of which this app has a client-side handler for) — the email template
 * must point its link at this route instead of {{ .ConfirmationURL }},
 * passing {{ .TokenHash }} and {{ .Type }}. Issues the same session cookie
 * the typed-code flow does, then redirects into the app.
 */
import type { EmailOtpType } from "@supabase/supabase-js";
import type { Env } from "../../index";
import { supabaseAdmin } from "../../lib/supabase";
import { sessionCookieHeader } from "../../auth/session";
import { getOrCreateBusinessForUser } from "../../auth/business";

export async function handleLinkVerify(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const token_hash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;

  if (!token_hash || !type) {
    return Response.redirect(new URL("/?auth_error=missing_token", url.origin).toString(), 302);
  }

  const { data, error } = await supabaseAdmin(env).auth.verifyOtp({ token_hash, type });
  if (error || !data.session || !data.user) {
    return Response.redirect(new URL("/?auth_error=invalid_or_expired", url.origin).toString(), 302);
  }

  // Fresh client — see otp-verify.ts for why verifyOtp's own client can't be reused for
  // the table write that follows (it silently loses its service-role auth context).
  await getOrCreateBusinessForUser(supabaseAdmin(env), data.user.id);

  return new Response(null, {
    status: 302,
    headers: {
      Location: "/",
      "Set-Cookie": sessionCookieHeader({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      }),
    },
  });
}
