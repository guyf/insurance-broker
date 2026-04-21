import { useEffect, useRef, useState } from "react";
import { FilingCabinet } from "./components/FilingCabinet";
import { Broker } from "./components/Broker";
import { QuotePanel } from "./components/QuotePanel";
import { deletePolicy, fetchPolicies, requote, sendMessage, uploadPolicy } from "./lib/api";
import type { ChatMessage, Policy, QuoteResult } from "./lib/types";

export default function App() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [policiesLoading, setPoliciesLoading] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "Hello! I'm your personal insurance broker. I can search your policy documents, check renewal dates, identify coverage gaps, and generate illustrative quotes for home, motor, or pet insurance.\n\nHow can I help you today?",
    },
  ]);
  const [thinking, setThinking] = useState(false);
  const [quote, setQuote] = useState<QuoteResult | null>(null);
  const [lastQuoteParams, setLastQuoteParams] = useState<{ toolName: string; args: Record<string, unknown> } | null>(null);
  const [quotePanelOpen, setQuotePanelOpen] = useState(false);
  const [requoting, setRequoting] = useState(false);
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null);
  const [prefillInput, setPrefillInput] = useState("");
  const [leftWidth, setLeftWidth] = useState(480);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();

  const onDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = leftWidth;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    const onMove = (ev: MouseEvent) => {
      setLeftWidth(Math.max(220, Math.min(520, startWidth + ev.clientX - startX)));
    };
    const onUp = () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  // Auto-open panel when a quote arrives
  useEffect(() => {
    if (quote) setQuotePanelOpen(true);
  }, [quote]);

  const loadPolicies = async () => {
    setPoliciesLoading(true);
    try {
      const data = await fetchPolicies();
      setPolicies(data);
    } catch {
      /* show empty state */
    } finally {
      setPoliciesLoading(false);
    }
  };

  useEffect(() => {
    loadPolicies();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showToast = (text: string, ok = true) => {
    setToast({ text, ok });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  };

  const handleSend = async (text: string) => {
    const userMessage: ChatMessage = { role: "user", content: text };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setThinking(true);
    try {
      const response = await sendMessage(nextMessages);
      setMessages([...nextMessages, { role: "assistant", content: response.content }]);
      if (response.quote) setQuote(response.quote);
      if (response.quoteToolName && response.quoteToolArgs) {
        setLastQuoteParams({ toolName: response.quoteToolName, args: response.quoteToolArgs });
      }
    } catch (err) {
      setMessages([
        ...nextMessages,
        {
          role: "assistant",
          content: `I encountered an error: ${err instanceof Error ? err.message : "Unknown error"}. Please try again.`,
        },
      ]);
    } finally {
      setThinking(false);
    }
  };

  const handleRequote = async () => {
    if (!lastQuoteParams) return;
    setRequoting(true);
    try {
      const newQuote = await requote(lastQuoteParams.toolName, lastQuoteParams.args);
      setQuote(newQuote);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Requote failed", false);
    } finally {
      setRequoting(false);
    }
  };

  const handleUpload = async (file: File, sourceFolder?: string) => {
    try {
      const result = await uploadPolicy(file, sourceFolder);
      showToast(`${result.filename} uploaded — ${result.chunks} chunks stored`);
      loadPolicies();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Upload failed", false);
    }
  };

  const handleDelete = async (sourcePaths: string[], title: string) => {
    try {
      await deletePolicy(sourcePaths);
      showToast(`"${title}" deleted`);
      loadPolicies();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Delete failed", false);
    }
  };

  const handlePolicyClick = (policy: Policy) => {
    setPrefillInput(`Tell me about my ${policy.filename}`);
  };

  return (
    <div className="h-full flex overflow-hidden bg-sidebar">
      {/* Left — Filing Cabinet (dark sidebar, draggable width) */}
      <aside style={{ width: leftWidth }} className="flex-shrink-0 flex flex-col">
        <FilingCabinet
          policies={policies}
          loading={policiesLoading}
          onPolicyClick={handlePolicyClick}
          onUpload={handleUpload}
          onDelete={handleDelete}
          onRequote={(prompt) => setPrefillInput(prompt)}
        />
      </aside>

      {/* Drag handle */}
      <div
        onMouseDown={onDragStart}
        className="w-1 flex-shrink-0 cursor-col-resize bg-sidebar-border hover:bg-blue-400 transition-colors"
      />

      {/* Middle — Broker Chat */}
      <main className="flex-1 flex flex-col bg-white min-w-0 relative">
        <Broker
          messages={messages}
          thinking={thinking}
          prefillInput={prefillInput}
          onPrefillConsumed={() => setPrefillInput("")}
          onSend={handleSend}
        />

        {/* Quotes tab — appears on the right edge when panel is closed and a quote exists */}
        {!quotePanelOpen && quote && (
          <button
            onClick={() => setQuotePanelOpen(true)}
            className="absolute right-0 top-1/2 -translate-y-1/2 bg-white border border-gray-200 border-r-0 rounded-l-lg px-1.5 py-3 shadow-sm hover:bg-gray-50 transition-colors z-10"
            title="Show quotes"
          >
            <span
              className="text-[11px] font-medium text-gray-500 select-none"
              style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
            >
              Quotes
            </span>
          </button>
        )}
      </main>

      {/* Right — Quote Panel (slides in from right like Preview thumbnails) */}
      <aside
        className={`flex-shrink-0 flex flex-col bg-gray-50 transition-[width,border] duration-300 ease-in-out overflow-hidden ${
          quotePanelOpen ? "w-80 border-l border-gray-200" : "w-0 border-l-0"
        }`}
      >
        <QuotePanel
          quote={quote}
          onClose={() => setQuotePanelOpen(false)}
          onRequote={lastQuoteParams ? handleRequote : undefined}
          requoting={requoting}
        />
      </aside>

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-5 left-1/2 -translate-x-1/2 text-sm px-4 py-2.5 rounded-lg shadow-lg z-50 flex items-center gap-2 ${
            toast.ok
              ? "bg-gray-900 text-white"
              : "bg-red-600 text-white"
          }`}
        >
          {toast.ok ? (
            <svg className="w-4 h-4 text-green-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          )}
          {toast.text}
        </div>
      )}
    </div>
  );
}
