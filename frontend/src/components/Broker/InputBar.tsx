import { useEffect, useRef, useState } from "react";

interface Props {
  onSend: (text: string) => void;
  disabled: boolean;
  prefill: string;
  onPrefillConsumed: () => void;
}

export function InputBar({ onSend, disabled, prefill, onPrefillConsumed }: Props) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (prefill) {
      setText(prefill);
      onPrefillConsumed();
      textareaRef.current?.focus();
    }
  }, [prefill, onPrefillConsumed]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const canSend = !!text.trim() && !disabled;

  return (
    <div className="flex-shrink-0 p-4">
      <div className="relative flex items-end rounded-2xl border border-slate-200 bg-white shadow-sm focus-within:border-slate-400 focus-within:shadow-md transition-all">
        <textarea
          ref={textareaRef}
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder="Ask about your coverage, renewals, or request a quote…"
          className="flex-1 resize-none bg-transparent px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none disabled:opacity-50 leading-relaxed"
        />
        <div className="flex-shrink-0 pr-2 pb-2">
          <button
            onClick={handleSubmit}
            disabled={!canSend}
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
              canSend
                ? "bg-primary text-white hover:bg-primary/90"
                : "bg-slate-100 text-slate-400 cursor-not-allowed"
            }`}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
      <p className="mt-1.5 text-center text-[10px] text-slate-400">
        Shift+Enter for new line
      </p>
    </div>
  );
}
