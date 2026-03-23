import ReactMarkdown from "react-markdown";
import type { ChatMessage } from "../../lib/types";

export function Message({ message }: { message: ChatMessage }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end px-6 py-1.5">
        <div className="max-w-[78%] bg-gray-100 text-gray-900 rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm leading-relaxed">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3 px-6 py-1.5">
      {/* Avatar */}
      <div className="w-7 h-7 rounded-full bg-gray-900 flex-shrink-0 flex items-center justify-center mt-0.5">
        <svg className="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
      </div>

      <div className="flex-1 min-w-0 text-sm text-gray-800 leading-relaxed">
        <ReactMarkdown
          components={{
            p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
            ul: ({ children }) => <ul className="mb-2 pl-4 list-disc space-y-0.5">{children}</ul>,
            ol: ({ children }) => <ol className="mb-2 pl-4 list-decimal space-y-0.5">{children}</ol>,
            li: ({ children }) => <li>{children}</li>,
            strong: ({ children }) => <strong className="font-semibold text-gray-900">{children}</strong>,
            code: ({ children }) => (
              <code className="bg-gray-100 text-gray-800 px-1.5 py-0.5 rounded text-xs font-mono">
                {children}
              </code>
            ),
            pre: ({ children }) => (
              <pre className="bg-gray-100 text-gray-800 p-3 rounded-lg text-xs font-mono overflow-x-auto mb-2">
                {children}
              </pre>
            ),
            h1: ({ children }) => <h1 className="text-base font-semibold text-gray-900 mb-2">{children}</h1>,
            h2: ({ children }) => <h2 className="text-sm font-semibold text-gray-900 mb-1.5">{children}</h2>,
            h3: ({ children }) => <h3 className="text-sm font-semibold text-gray-900 mb-1">{children}</h3>,
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
      <div className="w-7 h-7 rounded-full bg-gray-900 flex-shrink-0 flex items-center justify-center">
        <svg className="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
      </div>
      <div className="flex items-center gap-1 py-2">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="inline-block w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce"
            style={{ animationDelay: `${i * 160}ms` }}
          />
        ))}
      </div>
    </div>
  );
}
