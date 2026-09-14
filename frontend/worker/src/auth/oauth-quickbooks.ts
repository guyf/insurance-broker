/**
 * QuickBooks (Intuit) OAuth 2.0 — same shape as oauth-xero.ts. One notable
 * difference: Xero requires a separate /connections call to learn which
 * organisation was authorized; QuickBooks instead returns the company id
 * (`realmId`) directly as a query param on the callback redirect, so there's
 * no getTenantId() equivalent here — the callback route reads it straight
 * off the URL.
 */
import type { Env } from "../index";

const QUICKBOOKS_AUTH_URL = "https://appcenter.intuit.com/connect/oauth2";
const QUICKBOOKS_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";

const SCOPES = ["com.intuit.quickbooks.accounting", "openid", "email", "profile"].join(" ");

export interface QuickBooksTokenSet {
  access_token: string;
  refresh_token: string;
  id_token?: string;
  expires_in: number;
}

export function quickbooksAuthUrl(env: Env, state: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: env.INTUIT_CLIENT_ID,
    response_type: "code",
    scope: SCOPES,
    redirect_uri: redirectUri,
    state,
  });
  return `${QUICKBOOKS_AUTH_URL}?${params.toString()}`;
}

function basicAuthHeader(env: Env): string {
  return "Basic " + btoa(`${env.INTUIT_CLIENT_ID}:${env.INTUIT_CLIENT_SECRET}`);
}

export async function quickbooksExchangeCode(
  env: Env,
  code: string,
  redirectUri: string
): Promise<QuickBooksTokenSet> {
  const resp = await fetch(QUICKBOOKS_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(env),
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });
  if (!resp.ok) throw new Error(`QuickBooks token exchange failed: ${resp.status} ${await resp.text()}`);
  return resp.json();
}

export async function quickbooksRefreshTokens(env: Env, refreshToken: string): Promise<QuickBooksTokenSet> {
  const resp = await fetch(QUICKBOOKS_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(env),
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
  });
  if (!resp.ok) throw new Error(`QuickBooks token refresh failed: ${resp.status} ${await resp.text()}`);
  return resp.json();
}
