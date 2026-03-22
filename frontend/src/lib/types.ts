export interface Policy {
  policy_type: string;
  property: string | null;
  filename: string;
  source_path: string;
  renewal_date: string | null;
  premium: string | null;
}

export type RenewalStatus = "current" | "expiring" | "overdue";

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
}
