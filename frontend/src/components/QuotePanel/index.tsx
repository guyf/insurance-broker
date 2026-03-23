import type { QuoteResult } from "../../lib/types";
import { QuoteTable } from "./QuoteTable";

export function QuotePanel({ quote }: { quote: QuoteResult | null }) {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="h-12 flex-shrink-0 border-b border-gray-200 flex items-center px-4">
        <span className="text-sm font-medium text-gray-900">Quote Results</span>
      </div>

      <div className="flex-1 panel-scroll px-4 py-4">
        {quote ? (
          <QuoteTable quote={quote} />
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center px-6">
            <div className="w-12 h-12 rounded-xl bg-white border border-gray-200 shadow-sm flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                />
              </svg>
            </div>
            <p className="text-sm text-gray-500 leading-relaxed">
              Ask the broker for a home, motor, or pet quote and the comparison
              will appear here.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
