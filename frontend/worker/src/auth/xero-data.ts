/**
 * Fetch company financials from the Xero Accounting API — ported from
 * xero-insurance/backend/xero_data.py's row-scanning approach (Xero's
 * reports API doesn't expose totals as a clean field, only as a
 * SummaryRow buried in a Section with a matching title — fragile, but
 * that's the shape Xero gives us).
 */

const XERO_API = "https://api.xero.com/api.xro/2.0";

export interface XeroFinancials {
  name: string;
  registrationNumber: string | null;
  country: string;
  baseCurrency: string;
  revenue: number | null;
  employees: number | null;
  fixedAssets: number | null;
  raw: unknown;
}

interface XeroCell {
  Value?: string | number;
}
interface XeroRow {
  RowType?: string;
  Title?: string;
  Cells?: XeroCell[];
  Rows?: XeroRow[];
}

function headers(accessToken: string, tenantId: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Xero-tenant-id": tenantId,
    Accept: "application/json",
  };
}

async function getOrganisation(accessToken: string, tenantId: string): Promise<Record<string, unknown>> {
  const resp = await fetch(`${XERO_API}/Organisation`, { headers: headers(accessToken, tenantId) });
  if (!resp.ok) return {};
  const data = (await resp.json()) as { Organisations?: Array<Record<string, unknown>> };
  return data.Organisations?.[0] ?? {};
}

/** Finds a SummaryRow's second cell value inside a Section whose title includes `titleIncludes`. */
function findSectionTotal(rows: XeroRow[], titleIncludes: string): number | null {
  for (const row of rows) {
    if (row.RowType === "Section" && row.Title?.includes(titleIncludes)) {
      for (const sub of row.Rows ?? []) {
        if (sub.RowType === "SummaryRow") {
          const value = sub.Cells?.[1]?.Value;
          const num = Number(value);
          if (!Number.isNaN(num)) return Math.abs(num);
        }
      }
    }
  }
  return null;
}

async function getReportTotal(
  accessToken: string,
  tenantId: string,
  report: "ProfitAndLoss" | "BalanceSheet",
  titleIncludes: string
): Promise<number | null> {
  try {
    const resp = await fetch(`${XERO_API}/Reports/${report}`, { headers: headers(accessToken, tenantId) });
    if (!resp.ok) return null;
    const data = (await resp.json()) as { Reports?: Array<{ Rows?: XeroRow[] }> };
    const rows = data.Reports?.[0]?.Rows;
    return rows ? findSectionTotal(rows, titleIncludes) : null;
  } catch {
    return null;
  }
}

export async function fetchXeroFinancials(accessToken: string, tenantId: string): Promise<XeroFinancials> {
  const [org, revenue, fixedAssets] = await Promise.all([
    getOrganisation(accessToken, tenantId),
    getReportTotal(accessToken, tenantId, "ProfitAndLoss", "Income"),
    getReportTotal(accessToken, tenantId, "BalanceSheet", "Fixed Assets"),
  ]);

  return {
    name: (org.Name as string) ?? "Unknown Organisation",
    registrationNumber: (org.RegistrationNumber as string) ?? null,
    country: (org.CountryCode as string) ?? "GB",
    baseCurrency: (org.BaseCurrency as string) ?? "GBP",
    revenue,
    employees: (org.NumberOfEmployees as number) ?? null,
    fixedAssets,
    raw: org,
  };
}
