import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMessage } from "../../lib/types";

/** The denney.insure "D." mark — same SVG as /favicon.svg, inlined so the
 * chat avatar renders crisply at any size with no extra request. */
function DenneyMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      <rect width="64" height="64" rx="14" fill="#16213D" />
      <text x="22" y="46" fontFamily="Arial, Helvetica, sans-serif" fontWeight="800" fontSize="38" fill="#F6F7FB" textAnchor="middle">D</text>
      <circle cx="49" cy="46" r="5.5" fill="#EF2A5C" />
    </svg>
  );
}

export function Message({ message }: { message: ChatMessage }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end px-6 py-1.5">
        <div className="max-w-[78%] bg-slate-100 text-slate-900 rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm leading-relaxed">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3 px-6 py-1.5">
      {/* Avatar */}
      <DenneyMark className="w-7 h-7 flex-shrink-0 mt-0.5" />

      <div className="flex-1 min-w-0 text-sm text-slate-700 leading-relaxed">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
            ul: ({ children }) => <ul className="mb-2 pl-4 list-disc space-y-0.5">{children}</ul>,
            ol: ({ children }) => <ol className="mb-2 pl-4 list-decimal space-y-0.5">{children}</ol>,
            li: ({ children }) => <li>{children}</li>,
            strong: ({ children }) => <strong className="font-semibold text-slate-900">{children}</strong>,
            code: ({ children }) => (
              <code className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded text-xs font-mono">
                {children}
              </code>
            ),
            pre: ({ children }) => (
              <pre className="bg-slate-100 text-slate-700 p-3 rounded-lg text-xs font-mono overflow-x-auto mb-2">
                {children}
              </pre>
            ),
            h1: ({ children }) => <h1 className="text-base font-semibold text-slate-900 mb-2">{children}</h1>,
            h2: ({ children }) => <h2 className="text-sm font-semibold text-slate-900 mb-1.5">{children}</h2>,
            h3: ({ children }) => <h3 className="text-sm font-semibold text-slate-900 mb-1">{children}</h3>,
            table: ({ children }) => (
              <div className="overflow-x-auto mb-3">
                <table className="text-xs border-collapse w-full">{children}</table>
              </div>
            ),
            thead: ({ children }) => <thead className="bg-slate-100">{children}</thead>,
            th: ({ children }) => (
              <th className="border border-slate-200 px-2.5 py-1.5 text-left font-semibold text-slate-600 whitespace-nowrap">
                {children}
              </th>
            ),
            td: ({ children }) => (
              <td className="border border-slate-200 px-2.5 py-1.5 text-slate-600">{children}</td>
            ),
            tr: ({ children }) => <tr className="even:bg-slate-50">{children}</tr>,
          }}
        >
          {message.content}
        </ReactMarkdown>
      </div>
    </div>
  );
}

export function ThinkingIndicator() {
  return (
    <div className="flex gap-3 px-6 py-1.5">
      <DenneyMark className="w-7 h-7 flex-shrink-0" />
      <div className="flex items-center gap-1 py-2">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="inline-block w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce"
            style={{ animationDelay: `${i * 160}ms` }}
          />
        ))}
      </div>
    </div>
  );
}
