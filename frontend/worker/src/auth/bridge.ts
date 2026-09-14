import type { Env } from "../index";
import { supabaseAdmin } from "../lib/supabase";

/**
 * Bridges an email (from a completed Xero/QuickBooks OAuth flow) into a real
 * Supabase Auth session, so every login method — email OTP included — ends
 * up as an ordinary auth.users session. generateLink() creates the user if
 * they don't already exist (no separate lookup-or-create step needed), then
 * we redeem its token_hash immediately server-side via verifyOtp() — same
 * mechanism as clicking an email link, just without ever sending the email.
 *
 * Uses verification_type from the generateLink() response rather than
 * assuming "magiclink" — got bitten once already this project by guessing
 * an OTP `type` value instead of using what Supabase actually returns.
 */
export async function bridgeEmailToSession(
  env: Env,
  email: string
): Promise<{ accessToken: string; refreshToken: string; userId: string }> {
  const linkClient = supabaseAdmin(env);
  const { data: link, error: linkError } = await linkClient.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (linkError || !link) {
    throw new Error(`Failed to bridge ${email} into a session: ${linkError?.message ?? "unknown error"}`);
  }

  // Fresh client — generateLink()/verifyOtp() on the same instance would swap its
  // effective auth context, same gotcha as otp-verify.ts's businesses insert.
  const { data: verified, error: verifyError } = await supabaseAdmin(env).auth.verifyOtp({
    token_hash: link.properties.hashed_token,
    type: link.properties.verification_type,
  });
  if (verifyError || !verified.session || !verified.user) {
    throw new Error(`Failed to redeem bridged session for ${email}: ${verifyError?.message ?? "unknown error"}`);
  }

  return {
    accessToken: verified.session.access_token,
    refreshToken: verified.session.refresh_token,
    userId: verified.user.id,
  };
}
