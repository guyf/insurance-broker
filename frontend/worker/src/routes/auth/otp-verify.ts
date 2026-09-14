/**
 * POST /api/auth/otp-verify
 * Body: { email: string, token: string }
 * Redeems the 6-digit code, establishes the session cookie, and ensures a
 * business row exists for this user (created on first login).
 */
import type { Env } from "../../index";
import { supabaseAdmin } from "../../lib/supabase";
import { sessionCookieHeader } from "../../auth/session";
import { getOrCreateBusinessForUser } from "../../auth/business";

export async function handleOtpVerify(request: Request, env: Env): Promise<Response> {
  try {
    const { email, token } = (await request.json()) as { email?: string; token?: string };
    if (!email || !token) {
      return new Response(JSON.stringify({ error: "email and token are required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { data, error } = await supabaseAdmin(env).auth.verifyOtp({ email, token, type: "email" });
    if (error || !data.session || !data.user) {
      return new Response(
        JSON.stringify({ error: error?.message ?? "Invalid or expired code" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    // Fresh client, deliberately not the one verifyOtp() ran on — calling .auth.verifyOtp()
    // swaps that client's effective Authorization header to the now-signed-in user's session
    // for every subsequent request, including .from() table calls, which then hit the
    // service_role_all RLS policy as an ordinary user and get rejected. A brand new client
    // still carries the service-role apikey untouched.
    const businessId = await getOrCreateBusinessForUser(supabaseAdmin(env), data.user.id);

    return new Response(JSON.stringify({ business_id: businessId }), {
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": sessionCookieHeader({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        }),
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Verification failed" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
