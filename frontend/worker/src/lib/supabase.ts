import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Env } from "../index";

/**
 * Service-role client, used for every Supabase interaction the Worker makes
 * (auth admin/OTP calls and table reads/writes alike). The Worker is a
 * trusted server context, never exposed to the browser, so there's no
 * benefit to juggling a separate anon-key client for the auth calls.
 */
export function supabaseAdmin(env: Env): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
