export interface Policy {
  doc_type: string | null;
  policy_type: string;
  policy_types: string[] | null;
  insured_entity: string | null;
  filename: string;
  source_path: string;
  renewal_date: string | null;
  premium: string | null;
  provider: string | null;
  underwriter: string | null;
  asset_name: string | null;
  asset_value: string | null;
}

export type RenewalStatus = "current" | "expiring" | "overdue";

export interface RiskAnalysis {
  summary: string;
  exclusions: string[];
  concerns: string[];
}

export type CoverageAnalysis = Record<string, RiskAnalysis>;

export interface IdentifyResult {
  types: string[];
  insurer?: string;
  premium?: string;
  cover_limit?: string;
  renewal_date?: string;
  notes?: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface InsurerQuote {
  name: string;
  annual: number;
  monthly: number;
  excess: number;
  features: Array<{ included: boolean; text: string }>;
}

export interface QuoteResult {
  type: "home" | "motor" | "pet";
  ref: string;
  insurers: InsurerQuote[];
}

export interface ChatResponse {
  content: string;
  quote?: QuoteResult;
  quoteToolName?: string;
  quoteToolArgs?: Record<string, unknown>;
}
