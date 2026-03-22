import { useCallback, useEffect, useRef, useState } from "react";
import { FilingCabinet } from "./components/FilingCabinet";
import { Broker } from "./components/Broker";
import { QuotePanel } from "./components/QuotePanel";
import { fetchPolicies, sendMessage, uploadPolicy } from "./lib/api";
import type { ChatMessage, Policy, QuoteResult } from "./lib/types";

export default function App() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [policiesLoading, setPoliciesLoading] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "Hello. I'm your personal insurance broker. I can search your policy documents, check renewal dates, identify coverage gaps, and generate illustrative quotes for home, motor, or pet insurance.\n\nHow can I help you today?",
    },
  ]);
  const [thinking, setThinking] = useState(false);
  const [quote, setQuote] = useState<QuoteResult | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [prefillInput, setPrefillInput] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();

  const loadPolicies = useCallback(async () => {
    setPoliciesLoading(true);
    try {
      const data = await fetchPolicies();
      setPolicies(data);
    } catch {
      // silently fail — empty state is shown
    } finally {
      setPoliciesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPolicies();
  }, [loadPolicies]);

  const showToast = (msg: string) => {
    setToast(msg);
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
      setMessages([
        ...nextMessages,
        { role: "assistant", content: response.content },
      ]);
      if (response.quote) setQuote(response.quote);
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

  const handleUpload = async (file: File) => {
    try {
      const result = await uploadPolicy(file);
      showToast(`✓ ${result.filename} — ${result.chunks} chunks stored`);
      await loadPolicies();
    } catch (err) {
      showToast(`Upload failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  };

  const handlePolicyClick = (policy: Policy) => {
    setPrefillInput(`Tell me about my ${policy.filename}`);
  };

  return (
    <div className="h-full flex flex-col bg-navy">
      {/* Header */}
      <header className="h-12 flex-shrink-0 bg-navy border-b border-brass/20 flex items-center px-6 gap-4">
        <h1 className="font-cormorant text-brass text-xl font-semibold tracking-wide">
          Insurance Broker
        </h1>
        <span className="text-midtone/60 text-xs font-light tracking-widest uppercase">
          Personal Policy Intelligence
        </span>
      </header>

      {/* Three columns */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left — Filing Cabinet */}
        <aside className="w-72 flex-shrink-0 bg-panel border-r border-panel-border flex flex-col">
          <FilingCabinet
            policies={policies}
            loading={policiesLoading}
            onPolicyClick={handlePolicyClick}
            onUpload={handleUpload}
          />
        </aside>

        {/* Middle — Broker Chat */}
        <main className="flex-1 bg-panel border-r border-panel-border flex flex-col min-w-0">
          <Broker
            messages={messages}
            thinking={thinking}
            prefillInput={prefillInput}
            onPrefillConsumed={() => setPrefillInput("")}
            onSend={handleSend}
          />
        </main>

        {/* Right — Quote Panel */}
        <aside className="w-80 flex-shrink-0 bg-panel flex flex-col">
          <QuotePanel quote={quote} />
        </aside>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-midtone text-white text-sm px-5 py-3 shadow-panel border border-brass/30 z-50">
          {toast}
        </div>
      )}
    </div>
  );
}
