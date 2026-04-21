import type { QuoteResult } from "../../lib/types";
import { QuoteTable } from "./QuoteTable";

const TYPE_LABELS = {
  home: "Home",
  motor: "Motor",
  pet: "Pet",
};

interface QuotePanelProps {
  quote: QuoteResult | null;
  onClose: () => void;
  onRequote?: () => void;
  requoting?: boolean;
}

export function QuotePanel({ quote, onClose, onRequote, requoting }: QuotePanelProps) {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="h-12 flex-shrink-0 border-b border-gray-200 flex items-center px-4 gap-2">
        <span className="text-sm font-medium text-gray-900 flex-1">
          {quote ? `${TYPE_LABELS[quote.type]} Quotes` : "Quote Results"}
        </span>
        <button
          onClick={onClose}
          className="w-6 h-6 rounded-md flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          title="Hide panel"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex-1 panel-scroll px-4 py-4">
        {quote ? (
          <QuoteTable quote={quote} onRequote={onRequote} requoting={requoting} />
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center px-6">
            <div className="w-10 h-10 rounded-xl bg-white border border-gray-200 shadow-sm flex items-center justify-center mb-3">
              <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                />
              </svg>
            </div>
            <p className="text-sm text-gray-500 leading-relaxed">
              Click Requote on a policy to see a comparison quote here.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
