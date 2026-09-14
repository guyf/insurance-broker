/**
 * Xero OAuth 2.0 — ported from xero-insurance/backend/xero_auth.py, kept
 * provider-agnostic in shape (authUrl / exchangeCode / getTenantId /
 * refreshTokens / decode the OIDC id_token for email) so QuickBooks
 * (see oauth-quickbooks.ts) follows the same pattern.
 */
import type { Env } from "../index";
import { decodeIdTokenEmail } from "./jwt";

const XERO_AUTH_URL = "https://login.xero.com/identity/connect/authorize";
const XERO_TOKEN_URL = "https://identity.xero.com/connect/token";
const XERO_CONNECTIONS_URL = "https://api.xero.com/connections";

const SCOPES = [
  "openid",
  "profile",
  "email",
  "accounting.reports.profitandloss.read",
  "accounting.reports.balancesheet.read",
  "accounting.settings.read",
  "offline_access",
].join(" ");

export interface XeroTokenSet {
  access_token: string;
  refresh_token: string;
  id_token?: string;
  expires_in: number;
}

export function xeroAuthUrl(env: Env, state: string, redirectUri: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: env.XERO_CLIENT_ID,
    redirect_uri: redirectUri,
    scope: SCOPES,
    state,
  });
  return `${XERO_AUTH_URL}?${params.toString()}`;
}

function basicAuthHeader(env: Env): string {
  return "Basic " + btoa(`${env.XERO_CLIENT_ID}:${env.XERO_CLIENT_SECRET}`);
}

export async function xeroExchangeCode(env: Env, code: string, redirectUri: string): Promise<XeroTokenSet> {
  const resp = await fetch(XERO_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(env),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });
  if (!resp.ok) throw new Error(`Xero token exchange failed: ${resp.status} ${await resp.text()}`);
  return resp.json();
}

export async function xeroRefreshTokens(env: Env, refreshToken: string): Promise<XeroTokenSet> {
  const resp = await fetch(XERO_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(env),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
  });
  if (!resp.ok) throw new Error(`Xero token refresh failed: ${resp.status} ${await resp.text()}`);
  return resp.json();
}

export async function xeroGetTenantId(accessToken: string): Promise<string> {
  const resp = await fetch(XERO_CONNECTIONS_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) throw new Error(`Xero connections lookup failed: ${resp.status}`);
  const connections = (await resp.json()) as Array<{ tenantId: string }>;
  if (!connections.length) throw new Error("No Xero organisations connected");
  return connections[0].tenantId;
}

export const decodeXeroIdTokenEmail = decodeIdTokenEmail;
