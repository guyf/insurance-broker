import type { QuoteResult } from "../../lib/types";
import { QuoteTable } from "./QuoteTable";

interface Props {
  quote: QuoteResult | null;
}

export function QuotePanel({ quote }: Props) {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-panel-border flex-shrink-0">
        <h2 className="font-cormorant text-navy text-base font-semibold tracking-wide">
          Quote Results
        </h2>
      </div>

      {/* Content */}
      <div className="flex-1 panel-scroll px-4 py-4">
        {quote ? (
          <QuoteTable quote={quote} />
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center px-4">
            <div className="w-10 h-10 border border-brass/30 flex items-center justify-center mb-4">
              <span className="text-brass/50 text-lg">£</span>
            </div>
            <p className="text-sm text-gray-400 leading-relaxed">
              Ask the broker for a home, motor, or pet quote and the comparison
              table will appear here.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
