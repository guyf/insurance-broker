import type { Policy, QuoteResult } from "../../lib/types";
import { QuoteTable } from "./QuoteTable";
import { getRenewalStatus } from "../FilingCabinet/RenewalBadge";

interface Props {
  quote: QuoteResult | null;
  policies: Policy[];
  onRequote: (prompt: string) => void;
}

const DOCS_ROOT =
  "/Users/guy/Library/CloudStorage/GoogleDrive-guyfarley@gmail.com/My Drive/AI Broker/personal data";

function pdfUrl(sourcePath: string): string {
  const full = `${DOCS_ROOT}/${sourcePath}`;
  return "file://" + full.split("/").map((seg) => encodeURIComponent(seg)).join("/");
}

function getQuoteType(policy: Policy): "home" | "motor" | "pet" | null {
  if (!policy.source_path.startsWith("Insurance/")) return null;
  if (policy.policy_type === "home") return "home";
  if (policy.policy_type === "car") return "motor";
  if (policy.policy_type === "pet") return "pet";
  return null;
}

function renewalColor(renewalDate: string): string {
  const { status } = getRenewalStatus(renewalDate);
  if (status === "overdue") return "text-red-500";
  if (status === "expiring") return "text-amber-500";
  return "text-gray-400";
}

export function QuotePanel({ quote, policies, onRequote }: Props) {
  const insurancePolicies = policies.filter((p) =>
    p.source_path.startsWith("Insurance/")
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="h-14 flex-shrink-0 border-b border-gray-200 flex items-center px-4">
        <span className="text-lg font-semibold text-gray-900">Quotes</span>
      </div>

      <div className="flex-1 panel-scroll px-4 py-4 flex flex-col gap-4">
        {/* Policy cards */}
        {insurancePolicies.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold tracking-widest uppercase text-gray-400 mb-2">
              Your Policies
            </p>
            <div className="flex flex-col gap-2">
              {insurancePolicies.map((policy) => {
                const qt = getQuoteType(policy);
                const title = policy.filename.replace(/\.pdf$/i, "");
                return (
                  <div
                    key={policy.source_path + policy.filename}
                    className="rounded-lg border border-gray-200 bg-white px-3 py-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-800 leading-snug">
                          {title}
                        </p>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-gray-400">
                          {policy.property && (
                            <span className="capitalize">
                              {policy.property.replace(/_/g, " ")}
                            </span>
                          )}
                          {policy.premium && (
                            <span>£{policy.premium}/yr</span>
                          )}
                          {policy.renewal_date && (
                            <span className={renewalColor(policy.renewal_date)}>
                              Renews {policy.renewal_date}
                            </span>
                          )}
                        </div>
                        <a
                          href={pdfUrl(policy.source_path)}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 inline-block text-[10px] text-blue-400 hover:text-blue-600 hover:underline"
                        >
                          View PDF ↗
                        </a>
                      </div>
                      {qt && (
                        <button
                          onClick={() =>
                            onRequote(
                              `Get me a new ${qt} insurance quote for ${title}`
                            )
                          }
                          className="flex-shrink-0 mt-0.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-md transition-colors"
                        >
                          Requote
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Quote results */}
        {quote ? (
          <QuoteTable quote={quote} />
        ) : (
          <div className="flex flex-col items-center justify-center text-center px-4 py-6">
            <div className="w-10 h-10 rounded-xl bg-white border border-gray-200 shadow-sm flex items-center justify-center mb-3">
              <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                />
              </svg>
            </div>
            <p className="text-sm text-gray-500 leading-relaxed">
              Click Requote on a policy above, or ask the broker for a home, motor, or pet quote.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
