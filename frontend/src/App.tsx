import { useEffect, useRef, useState } from "react";
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
        "Hello! I'm your personal insurance broker. I can search your policy documents, check renewal dates, identify coverage gaps, and generate illustrative quotes for home, motor, or pet insurance.\n\nHow can I help you today?",
    },
  ]);
  const [thinking, setThinking] = useState(false);
  const [quote, setQuote] = useState<QuoteResult | null>(null);
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null);
  const [prefillInput, setPrefillInput] = useState("");
  const [leftWidth, setLeftWidth] = useState(320);
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
      showToast(`${result.filename} uploaded — ${result.chunks} chunks stored`);
      loadPolicies();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Upload failed", false);
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
          onRequote={(prompt) => setPrefillInput(prompt)}
        />
      </aside>

      {/* Drag handle */}
      <div
        onMouseDown={onDragStart}
        className="w-1 flex-shrink-0 cursor-col-resize bg-sidebar-border hover:bg-blue-400 transition-colors"
      />

      {/* Middle — Broker Chat */}
      <main className="flex-1 flex flex-col bg-white min-w-0 border-r border-gray-200">
        <Broker
          messages={messages}
          thinking={thinking}
          prefillInput={prefillInput}
          onPrefillConsumed={() => setPrefillInput("")}
          onSend={handleSend}
        />
      </main>

      {/* Right — Quote Panel */}
      <aside className="w-96 flex-shrink-0 flex flex-col bg-gray-50">
        <QuotePanel quote={quote} />
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
