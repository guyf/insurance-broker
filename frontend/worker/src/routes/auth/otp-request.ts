/**
 * POST /api/auth/otp-request
 * Body: { email: string }
 * Triggers Supabase Auth's email-OTP flow — no password anywhere.
 */
import type { Env } from "../../index";
import { supabaseAdmin } from "../../lib/supabase";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function handleOtpRequest(request: Request, env: Env): Promise<Response> {
  try {
    const { email } = (await request.json()) as { email?: string };
    if (!email || !EMAIL_RE.test(email)) {
      return new Response(JSON.stringify({ error: "Valid email required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const supabase = supabaseAdmin(env);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });
    if (error) throw error;

    return new Response(JSON.stringify({ status: "sent" }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Failed to send code" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
