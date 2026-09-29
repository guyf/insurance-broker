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
  /** Set on persisted assistant replies — used for feedback. */
  id?: string;
  role: "user" | "assistant";
  content: string;
  quote?: QuoteResult;
  rating?: 1 | -1;
}

export interface ChatSessionSummary {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

export interface InsurerQuote {
  name: string;
  annual: number;
  monthly: number;
  excess: number;
  features: Array<{ included: boolean; text: string }>;
}

export interface QuoteResult {
  type:
    | "public_liability"
    | "employers_liability"
    | "professional_indemnity"
    | "cyber";
  ref: string;
  insurers: InsurerQuote[];
}

export interface ChatResponse {
  session_id: string;
  message_id: string | null;
  content: string;
  quote?: QuoteResult;
  quoteToolName?: string;
  quoteToolArgs?: Record<string, unknown>;
}

export interface PinnedInsight {
  id: string;
  message_id: string | null;
  title: string;
  content: string;
  created_at: string;
}
