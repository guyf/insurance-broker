import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Every authenticated user owns exactly one business in this first cut
 * (team members / multiple businesses per user are out of scope for now).
 * Called on first login via any method so a business_id exists to scope
 * documents/policies/financials against from the very first request.
 */
export async function getOrCreateBusinessForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<string> {
  const { data: existing } = await supabase
    .from("businesses")
    .select("id")
    .eq("owner_user_id", userId)
    .limit(1)
    .maybeSingle();

  if (existing) return existing.id;

  const { data: created, error } = await supabase
    .from("businesses")
    .insert({ owner_user_id: userId })
    .select("id")
    .single();

  if (error || !created) {
    throw new Error(`Failed to create business: ${error?.message ?? "unknown error"}`);
  }
  return created.id;
}
