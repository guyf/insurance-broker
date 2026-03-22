import type { InsurerQuote, QuoteResult } from "../../lib/types";

const MEDALS = ["🥇", "🥈", "🥉"];

const TYPE_LABELS = { home: "Home Insurance", motor: "Motor Insurance", pet: "Pet Insurance" };

function InsurerRow({ insurer, index }: { insurer: InsurerQuote; index: number }) {
  return (
    <div className="border border-panel-border mb-3">
      {/* Insurer header */}
      <div className="bg-navy/5 px-4 py-2.5 border-b border-panel-border flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold text-navy">
          {MEDALS[index]} {insurer.name}
        </span>
      </div>

      {/* Pricing */}
      <div className="px-4 py-3 flex items-baseline gap-4 border-b border-panel-border">
        <div>
          <span className="text-lg font-semibold text-navy font-cormorant">
            £{insurer.annual.toLocaleString()}
          </span>
          <span className="text-xs text-gray-400 ml-1">/yr</span>
        </div>
        <div>
          <span className="text-sm text-midtone">
            £{insurer.monthly.toLocaleString()}
          </span>
          <span className="text-xs text-gray-400 ml-1">/mo</span>
        </div>
        <div className="ml-auto text-xs text-gray-500">
          Excess: £{insurer.excess}
        </div>
      </div>

      {/* Features */}
      <ul className="px-4 py-2.5 space-y-1">
        {insurer.features.map((f, i) => (
          <li key={i} className="flex items-start gap-2 text-xs">
            <span
              className={`mt-0.5 flex-shrink-0 font-semibold ${
                f.included ? "text-green-600" : "text-gray-300"
              }`}
            >
              {f.included ? "✓" : "✗"}
            </span>
            <span className={f.included ? "text-navy" : "text-gray-400"}>
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
      <div className="flex items-baseline justify-between mb-4">
        <h3 className="font-cormorant text-navy text-base font-semibold">
          {TYPE_LABELS[quote.type]}
        </h3>
        {quote.ref && (
          <span className="text-[10px] text-gray-400 font-mono">{quote.ref}</span>
        )}
      </div>

      {quote.insurers.map((insurer, i) => (
        <InsurerRow key={insurer.name} insurer={insurer} index={i} />
      ))}

      <p className="text-[10px] text-gray-400 leading-relaxed border-t border-panel-border pt-3 mt-1">
        Illustrative quotes only — not a real insurance offer. Speak to an
        FCA-authorised broker before purchasing cover.
      </p>
    </div>
  );
}
