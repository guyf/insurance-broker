import ReactMarkdown from "react-markdown";
import type { ChatMessage } from "../../lib/types";

interface Props {
  message: ChatMessage;
}

export function Message({ message }: Props) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className="flex justify-end px-6 py-2">
        <div className="max-w-[75%] bg-midtone text-white px-4 py-2.5 text-sm leading-relaxed">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex px-6 py-2">
      <div className="max-w-[85%] border-l-2 border-brass/50 pl-4">
        <div className="text-sm text-navy leading-relaxed prose prose-sm prose-neutral max-w-none">
          <ReactMarkdown
            components={{
              // Override default prose styles to match design
              p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
              ul: ({ children }) => (
                <ul className="mb-2 pl-4 list-disc">{children}</ul>
              ),
              ol: ({ children }) => (
                <ol className="mb-2 pl-4 list-decimal">{children}</ol>
              ),
              li: ({ children }) => <li className="mb-0.5">{children}</li>,
              strong: ({ children }) => (
                <strong className="font-semibold text-navy">{children}</strong>
              ),
              code: ({ children }) => (
                <code className="bg-navy/5 px-1 py-0.5 text-xs font-mono">
                  {children}
                </code>
              ),
              pre: ({ children }) => (
                <pre className="bg-navy/5 p-3 text-xs font-mono overflow-x-auto mb-2">
                  {children}
                </pre>
              ),
              h1: ({ children }) => (
                <h1 className="font-cormorant text-lg font-semibold mb-2">
                  {children}
                </h1>
              ),
              h2: ({ children }) => (
                <h2 className="font-cormorant text-base font-semibold mb-1.5">
                  {children}
                </h2>
              ),
              h3: ({ children }) => (
                <h3 className="font-semibold text-sm mb-1">{children}</h3>
              ),
            }}
          >
            {message.content}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
}

export function ThinkingIndicator() {
  return (
    <div className="flex px-6 py-2">
      <div className="border-l-2 border-brass/30 pl-4">
        <span className="text-xs text-midtone/50 italic">Thinking…</span>
        <span className="ml-1 inline-flex gap-0.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="inline-block w-1 h-1 rounded-full bg-brass/40 animate-bounce"
              style={{ animationDelay: `${i * 150}ms` }}
            />
          ))}
        </span>
      </div>
    </div>
  );
}
