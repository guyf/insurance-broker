import type { InsurerQuote, QuoteResult } from "../../lib/types";

const TYPE_LABELS = {
  home: "Home Insurance",
  motor: "Motor Insurance",
  pet: "Pet Insurance",
};

function InsurerCard({ insurer, rank }: { insurer: InsurerQuote; rank: number }) {
  const isTop = rank === 0;
  return (
    <div
      className={`rounded-xl border bg-white mb-3 overflow-hidden ${
        isTop ? "border-gray-300 shadow-sm" : "border-gray-200"
      }`}
    >
      {/* Name + price */}
      <div className="px-4 pt-3.5 pb-3 border-b border-gray-100">
        <div className="flex items-start justify-between gap-2">
          <span className="text-sm font-semibold text-gray-900">{insurer.name}</span>
          {isTop && (
            <span className="text-[10px] font-medium bg-gray-900 text-white px-2 py-0.5 rounded-full">
              Best price
            </span>
          )}
        </div>
        <div className="flex items-baseline gap-3 mt-1.5">
          <span className="text-xl font-bold text-gray-900 tracking-tight">
            £{insurer.annual.toLocaleString()}
            <span className="text-xs font-normal text-gray-400 ml-1">/yr</span>
          </span>
          <span className="text-sm text-gray-500">
            £{insurer.monthly}/mo
          </span>
          <span className="ml-auto text-xs text-gray-400">
            £{insurer.excess} excess
          </span>
        </div>
      </div>

      {/* Features */}
      <ul className="px-4 py-3 space-y-1.5">
        {insurer.features.map((f, i) => (
          <li key={i} className="flex items-center gap-2 text-xs">
            <span
              className={`flex-shrink-0 ${
                f.included ? "text-emerald-500" : "text-gray-300"
              }`}
            >
              {f.included ? (
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              )}
            </span>
            <span className={f.included ? "text-gray-700" : "text-gray-400"}>
              {f.text}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function QuoteTable({ quote }: { quote: QuoteResult }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900">{TYPE_LABELS[quote.type]}</h3>
        {quote.ref && (
          <span className="text-[10px] text-gray-400 font-mono">{quote.ref}</span>
        )}
      </div>

      {quote.insurers.map((insurer, i) => (
        <InsurerCard key={insurer.name} insurer={insurer} rank={i} />
      ))}

      <p className="text-[10px] text-gray-400 leading-relaxed text-center mt-2">
        Illustrative quotes only. Speak to an FCA-authorised broker for actual cover.
      </p>
    </div>
  );
}
