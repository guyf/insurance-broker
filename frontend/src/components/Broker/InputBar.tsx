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

  // Apply prefill from FilingCabinet card click
  useEffect(() => {
    if (prefill) {
      setText(prefill);
      onPrefillConsumed();
      textareaRef.current?.focus();
    }
  }, [prefill, onPrefillConsumed]);

  // Auto-resize textarea
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

  return (
    <div className="flex-shrink-0 border-t border-panel-border bg-panel px-4 py-3">
      <div className="flex items-end gap-3">
        <textarea
          ref={textareaRef}
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder="Ask about your coverage, renewals, or request a quote…"
          className="flex-1 resize-none bg-white border border-panel-border px-3 py-2 text-sm text-navy placeholder:text-gray-400 focus:outline-none focus:border-brass/60 disabled:opacity-50 transition-colors leading-relaxed"
        />
        <button
          onClick={handleSubmit}
          disabled={disabled || !text.trim()}
          className="flex-shrink-0 px-4 py-2 bg-navy text-brass text-sm font-medium tracking-wide hover:bg-midtone disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Send
        </button>
      </div>
      <p className="mt-1.5 text-[10px] text-gray-400">
        Shift+Enter for new line
      </p>
    </div>
  );
}
