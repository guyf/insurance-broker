export interface BusinessInfo {
  user: { email: string | null };
  business: { id: string; name: string | null; created_at: string } | null;
  connections: Array<{ provider: string; connected_at: string }>;
  financials: {
    source: string;
    revenue: number | null;
    employees: number | null;
    fixed_assets: number | null;
    payroll: number | null;
    industry: string | null;
    fetched_at: string;
  } | null;
}

export async function requestOtp(email: string): Promise<void> {
  const res = await fetch("/api/auth/otp-request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? "Failed to send code");
  }
}

export async function verifyOtp(email: string, token: string): Promise<{ business_id: string }> {
  const res = await fetch("/api/auth/otp-verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, token }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? "Invalid or expired code");
  }
  return res.json();
}

export async function logout(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST" });
}

/** Returns the current business info, or null if not authenticated. */
export async function getCurrentBusiness(): Promise<BusinessInfo | null> {
  const res = await fetch("/api/business");
  if (res.status === 401) return null;
  if (!res.ok) throw new Error("Failed to load business info");
  return res.json();
}

export async function updateBusinessName(name: string): Promise<void> {
  const res = await fetch("/api/business", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? "Failed to update business name");
  }
}
