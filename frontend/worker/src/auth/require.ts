import type { Env } from "../index";
import { readSession } from "./session";
import { supabaseAdmin } from "../lib/supabase";

export interface AuthedRequest {
  userId: string;
  email: string | null;
  businessId: string;
  /** Set-Cookie header to forward on the response if the session was refreshed mid-request. */
  refreshedCookie: string | null;
}

/**
 * Every session-gated route calls this first. Returns null when there's no
 * valid session, or — should essentially never happen, since
 * getOrCreateBusinessForUser runs on every login — the user has no business
 * row yet. Either way the caller responds 401; business_id is always
 * derived here from the verified session, never accepted from the client.
 */
export async function requireBusiness(request: Request, env: Env): Promise<AuthedRequest | null> {
  const session = await readSession(request, env);
  if (!session) return null;

  const { data: business } = await supabaseAdmin(env)
    .from("businesses")
    .select("id")
    .eq("owner_user_id", session.user.id)
    .limit(1)
    .maybeSingle();

  if (!business) return null;

  return {
    userId: session.user.id,
    email: session.user.email,
    businessId: business.id,
    refreshedCookie: session.refreshedCookie,
  };
}

export function unauthorizedResponse(): Response {
  return new Response(JSON.stringify({ error: "Not authenticated" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}

/** Attaches the refreshed-session cookie to a response's headers, if one was issued. */
export function withRefreshedCookie(response: Response, refreshedCookie: string | null): Response {
  if (!refreshedCookie) return response;
  const headers = new Headers(response.headers);
  headers.set("Set-Cookie", refreshedCookie);
  return new Response(response.body, { status: response.status, headers });
}
