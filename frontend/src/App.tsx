import { useEffect, useRef, useState } from "react";
import BusinessPanel from "./components/BusinessPanel";
import { Broker } from "./components/Broker";
import { QuotePanel } from "./components/QuotePanel";
import LoginGate from "./components/LoginGate";
import { fetchPolicies, requote, sendMessage, uploadPolicy } from "./lib/api";
import { getCurrentBusiness, logout, type BusinessInfo } from "./lib/auth";
import type { ChatMessage, Policy, QuoteResult } from "./lib/types";

export default function App() {
  const [authChecked, setAuthChecked] = useState(false);
  const [business, setBusiness] = useState<BusinessInfo | null>(null);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "Hello! I'm your commercial insurance broker. I can check what your business already has covered, spot gaps against the risks SMEs typically face, and get you illustrative quotes for liability, property, or cyber cover.\n\nHow can I help you today?",
    },
  ]);
  const [thinking, setThinking] = useState(false);
  const [quote, setQuote] = useState<QuoteResult | null>(null);
  const [lastQuoteParams, setLastQuoteParams] = useState<{ toolName: string; args: Record<string, unknown> } | null>(null);
  const [quotePanelOpen, setQuotePanelOpen] = useState(false);
  const [requoting, setRequoting] = useState(false);
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null);
  const [prefillInput, setPrefillInput] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();

  // Auto-open panel when a quote arrives
  useEffect(() => {
    if (quote) setQuotePanelOpen(true);
  }, [quote]);

  const loadPolicies = async () => {
    try {
      const data = await fetchPolicies();
      setPolicies(data);
    } catch {
      /* show empty state */
    }
  };

  useEffect(() => {
    getCurrentBusiness()
      .then(setBusiness)
      .catch(() => setBusiness(null))
      .finally(() => setAuthChecked(true));
  }, []);

  useEffect(() => {
    if (business) loadPolicies();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business]);

  const handleAuthenticated = () => {
    getCurrentBusiness().then(setBusiness);
  };

  const handleLogout = async () => {
    await logout();
    setBusiness(null);
  };

  const handleBusinessNameUpdate = (name: string) => {
    setBusiness((prev) => (prev ? { ...prev, business: prev.business ? { ...prev.business, name } : prev.business } : prev));
  };

  const handleAnalysisComplete = (summary: string) => {
    setMessages((prev) => [...prev, { role: "assistant", content: summary }]);
  };

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

  const handleUpload = async (file: File) => {
    const result = await uploadPolicy(file);
    showToast(`${result.filename} uploaded — ${result.chunks} chunks stored`);
    await loadPolicies();
  };

  if (!authChecked) return <div className="h-full bg-slate-50" />;
  if (!business) return <LoginGate onAuthenticated={handleAuthenticated} />;

  return (
    <div className="h-full flex overflow-hidden bg-slate-50">
      {/* Left — Business Panel (50%) */}
      <aside className="w-1/2 flex-shrink-0 flex flex-col">
        <BusinessPanel
          business={business}
          policies={policies}
          onUpload={handleUpload}
          onSendMessage={(prompt) => setPrefillInput(prompt)}
          onLogout={handleLogout}
          onBusinessNameUpdate={handleBusinessNameUpdate}
          onAnalysisComplete={handleAnalysisComplete}
        />
      </aside>

      {/* Right — Broker Chat (50%) */}
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
            className="absolute right-0 top-1/2 -translate-y-1/2 bg-white border border-slate-200 border-r-0 rounded-l-lg px-1.5 py-3 shadow-sm hover:bg-slate-50 transition-colors z-10"
            title="Show quotes"
          >
            <span
              className="text-[11px] font-medium text-slate-500 select-none"
              style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
            >
              Quotes
            </span>
          </button>
        )}
      </main>

      {/* Right — Quote Panel (slides in from right like Preview thumbnails) */}
      <aside
        className={`flex-shrink-0 flex flex-col bg-slate-50 transition-[width,border] duration-300 ease-in-out overflow-hidden ${
          quotePanelOpen ? "w-80 border-l border-slate-200" : "w-0 border-l-0"
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
            toast.ok ? "bg-slate-900 text-white" : "bg-primary text-white"
          }`}
        >
          {toast.ok ? (
            <svg className="w-4 h-4 text-accent flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
