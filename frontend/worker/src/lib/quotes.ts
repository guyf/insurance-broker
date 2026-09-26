/**
 * Parses mcp-quote's build_panel() text output into structured data for the
 * Quote panel. Shared by /api/chat and /api/requote.
 */

export type QuoteType =
  | "public_liability"
  | "employers_liability"
  | "professional_indemnity"
  | "cyber";

export interface InsurerQuote {
  name: string;
  annual: number;
  monthly: number;
  excess: number;
  features: Array<{ included: boolean; text: string }>;
}

export interface QuoteResult {
  type: QuoteType;
  ref: string;
  insurers: InsurerQuote[];
}

/** Quote tool name → the quote type it produces. Also the allowlist for /api/requote. */
export const QUOTE_TOOL_TYPES: Record<string, QuoteType> = {
  get_public_liability_quote: "public_liability",
  get_employers_liability_quote: "employers_liability",
  get_professional_indemnity_quote: "professional_indemnity",
  get_cyber_quote: "cyber",
};

export function parseQuoteResult(toolName: string, text: string): QuoteResult | null {
  const type = QUOTE_TOOL_TYPES[toolName];
  if (!type) return null;

  const refMatch = text.match(/Quote Reference:\s*(\S+)/);
  const ref = refMatch?.[1] ?? "";

  const lines = text.split("\n");
  const insurers: InsurerQuote[] = [];
  let current: InsurerQuote | null = null;

  for (const line of lines) {
    // Header line: "🥇 Beacon Insurance        £500/yr  (£42/mo)  Excess: £250"
    const header = line.match(
      /[🥇🥈🥉]\s+(.+?)\s{2,}£([\d,]+)\/yr\s+\(£([\d,]+)\/mo\)\s+Excess:\s+£([\d,]+)/u
    );
    if (header) {
      if (current) insurers.push(current);
      current = {
        name: header[1].trim(),
        annual: parseInt(header[2].replace(/,/g, "")),
        monthly: parseInt(header[3].replace(/,/g, "")),
        excess: parseInt(header[4].replace(/,/g, "")),
        features: [],
      };
    } else if (current && /^\s+[✓✗]/.test(line)) {
      current.features.push({
        included: line.includes("✓"),
        text: line.replace(/^\s+[✓✗]\s*/, "").trim(),
      });
    }
  }
  if (current) insurers.push(current);

  return insurers.length > 0 ? { type, ref, insurers } : null;
}
