/**
 * Fetch company financials from the QuickBooks Accounting API — same
 * approach as xero-data.ts (a report's grand total is buried in a nested
 * row rather than exposed as a clean field), adapted to QuickBooks' report
 * JSON shape: Rows.Row[] entries carry a `group` code (e.g. "Income",
 * "FixedAssets") and their running total sits in that row's own `Summary`,
 * not a child row like Xero's SummaryRow.
 */
export interface QuickBooksFinancials {
  name: string;
  registrationNumber: string | null;
  country: string;
  baseCurrency: string;
  revenue: number | null;
  employees: number | null;
  fixedAssets: number | null;
  raw: unknown;
}

interface QBColData {
  value?: string;
}
interface QBRow {
  group?: string;
  Rows?: { Row?: QBRow[] };
  Summary?: { ColData?: QBColData[] };
}

function headers(accessToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/json",
  };
}

async function getCompanyInfo(apiBase: string, accessToken: string, realmId: string): Promise<Record<string, unknown>> {
  const resp = await fetch(`${apiBase}/v3/company/${realmId}/companyinfo/${realmId}?minorversion=65`, {
    headers: headers(accessToken),
  });
  if (!resp.ok) return {};
  const data = (await resp.json()) as { CompanyInfo?: Record<string, unknown> };
  return data.CompanyInfo ?? {};
}

/** Finds the Summary total for the row whose `group` matches, searching nested Rows too. */
function findGroupTotal(rows: QBRow[], group: string): number | null {
  for (const row of rows) {
    if (row.group === group && row.Summary?.ColData?.length) {
      const cols = row.Summary.ColData;
      const num = Number(cols[cols.length - 1]?.value);
      if (!Number.isNaN(num)) return Math.abs(num);
    }
    const nested = row.Rows?.Row;
    if (nested) {
      const found = findGroupTotal(nested, group);
      if (found !== null) return found;
    }
  }
  return null;
}

async function getReportTotal(
  apiBase: string,
  accessToken: string,
  realmId: string,
  report: "ProfitAndLoss" | "BalanceSheet",
  group: string
): Promise<number | null> {
  try {
    const resp = await fetch(`${apiBase}/v3/company/${realmId}/reports/${report}?minorversion=65`, {
      headers: headers(accessToken),
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as { Rows?: { Row?: QBRow[] } };
    const rows = data.Rows?.Row;
    return rows ? findGroupTotal(rows, group) : null;
  } catch {
    return null;
  }
}

export async function fetchQuickBooksFinancials(
  apiBase: string,
  accessToken: string,
  realmId: string
): Promise<QuickBooksFinancials> {
  const [info, revenue, fixedAssets] = await Promise.all([
    getCompanyInfo(apiBase, accessToken, realmId),
    getReportTotal(apiBase, accessToken, realmId, "ProfitAndLoss", "Income"),
    getReportTotal(apiBase, accessToken, realmId, "BalanceSheet", "FixedAssets"),
  ]);

  const address = info.Country as string | undefined;

  return {
    name: (info.CompanyName as string) ?? "Unknown Organisation",
    // QuickBooks' Company Info API doesn't expose a registration number or
    // employee count field the way Xero's Organisation object does.
    registrationNumber: null,
    country: address ?? "US",
    baseCurrency: "USD",
    revenue,
    employees: null,
    fixedAssets,
    raw: info,
  };
}
