import type { Env } from "../index";
import { supabaseAdmin } from "../lib/supabase";

const COOKIE_NAME = "ib_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days — refreshed on every verify, so an active user never hits it

interface SessionTokens {
  access_token: string;
  refresh_token: string;
}

export interface AuthedUser {
  id: string;
  email: string | null;
}

function parseCookies(request: Request): Record<string, string> {
  const header = request.headers.get("cookie");
  if (!header) return {};
  const out: Record<string, string> = {};
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

export function sessionCookieHeader(tokens: SessionTokens): string {
  const value = encodeURIComponent(JSON.stringify(tokens));
  return `${COOKIE_NAME}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${MAX_AGE_SECONDS}`;
}

export function clearedSessionCookieHeader(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

/**
 * Verifies the session cookie, transparently refreshing it via the Supabase
 * refresh token when the access token has expired. When a refresh happens,
 * `refreshedCookie` carries the Set-Cookie header the caller must forward
 * on its response — otherwise the browser's cookie falls out of sync with
 * the token Supabase just issued and every subsequent request re-triggers
 * the same refresh.
 */
export async function readSession(
  request: Request,
  env: Env
): Promise<{ user: AuthedUser; refreshedCookie: string | null } | null> {
  const raw = parseCookies(request)[COOKIE_NAME];
  if (!raw) return null;

  let tokens: SessionTokens;
  try {
    tokens = JSON.parse(raw);
  } catch {
    return null;
  }

  const supabase = supabaseAdmin(env);

  const { data, error } = await supabase.auth.getUser(tokens.access_token);
  if (!error && data.user) {
    return { user: { id: data.user.id, email: data.user.email ?? null }, refreshedCookie: null };
  }

  const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession({
    refresh_token: tokens.refresh_token,
  });
  if (refreshError || !refreshed.session || !refreshed.user) return null;

  return {
    user: { id: refreshed.user.id, email: refreshed.user.email ?? null },
    refreshedCookie: sessionCookieHeader({
      access_token: refreshed.session.access_token,
      refresh_token: refreshed.session.refresh_token,
    }),
  };
}
