/**
 * Decodes an OIDC id_token's `email` claim. No signature check needed — both
 * Xero and QuickBooks id_tokens handled here come straight back from that
 * provider's own token endpoint over a call we just made directly
 * (client-secret authenticated), not from anything client-supplied.
 */
export function decodeIdTokenEmail(idToken: string): string | null {
  try {
    const payload = idToken.split(".")[1];
    const padded = payload
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(payload.length + ((4 - (payload.length % 4)) % 4), "=");
    const claims = JSON.parse(atob(padded)) as { email?: string };
    return claims.email ?? null;
  } catch {
    return null;
  }
}
