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

function FeedbackButtons({
  messageId,
  rating,
  onFeedback,
}: {
  messageId: string;
  rating?: 1 | -1;
  onFeedback: (messageId: string, rating: 1 | -1) => void;
}) {
  const button = (value: 1 | -1, label: string, path: string) => (
    <button
      onClick={() => onFeedback(messageId, value)}
      title={label}
      aria-label={label}
      aria-pressed={rating === value}
      className={`p-1 rounded transition-colors ${
        rating === value ? (value === 1 ? "text-accent" : "text-primary") : "text-slate-300 hover:text-slate-500"
      }`}
    >
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d={path} />
      </svg>
    </button>
  );
  return (
    <div className="flex gap-0.5 mt-1 -ml-1">
      {button(1, "Helpful", "M7 11v9H4v-9h3zm0 0l4-8a2 2 0 012 2v4h5.5a2 2 0 012 2.3l-1.2 7A2 2 0 0117.3 20H7")}
      {button(-1, "Not helpful", "M17 13V4h3v9h-3zm0 0l-4 8a2 2 0 01-2-2v-4H5.5a2 2 0 01-2-2.3l1.2-7A2 2 0 016.7 4H17")}
    </div>
  );
}

/** Renders assistant markdown — shared by chat replies and the pinned-answers list. */
export function MarkdownBody({ children }: { children: string }) {
  return (
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
    {children}
  </ReactMarkdown>
  );
}

export function Message({
  message,
  onFeedback,
  pinned,
  onTogglePin,
}: {
  message: ChatMessage;
  onFeedback?: (messageId: string, rating: 1 | -1) => void;
  pinned?: boolean;
  onTogglePin?: (message: ChatMessage) => void;
}) {
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
        <MarkdownBody>{message.content}</MarkdownBody>
        {message.id && onFeedback && (
          <div className="flex items-center">
            <FeedbackButtons messageId={message.id} rating={message.rating} onFeedback={onFeedback} />
            {onTogglePin && (
              <button
                onClick={() => onTogglePin(message)}
                title={pinned ? "Unpin this answer" : "Pin this answer"}
                aria-label={pinned ? "Unpin this answer" : "Pin this answer"}
                aria-pressed={!!pinned}
                className={`mt-1 ml-0.5 p-1 rounded transition-colors ${pinned ? "text-primary" : "text-slate-300 hover:text-slate-500"}`}
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill={pinned ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                </svg>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function ThinkingIndicator({ status }: { status?: string | null }) {
  return (
    <div className="flex gap-3 px-6 py-1.5">
      <DenneyMark className="w-7 h-7 flex-shrink-0" />
      <div className="flex items-center gap-2 py-2" role="status" aria-live="polite">
        <div className="flex items-center gap-1">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="inline-block w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce"
              style={{ animationDelay: `${i * 160}ms` }}
            />
          ))}
        </div>
        {status && <span className="text-xs text-slate-500">{status}</span>}
      </div>
    </div>
  );
}
