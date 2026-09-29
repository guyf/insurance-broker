import { useUploadQueue } from "./lib/uploadQueue";
import { useEffect, useRef, useState } from "react";
import BusinessPanel from "./components/BusinessPanel";
import { Broker } from "./components/Broker";
import { QuotePanel } from "./components/QuotePanel";
import LoginGate from "./components/LoginGate";
import {
  fetchPolicies,
  getChatSession,
  listChatSessions,
  requote,
  sendChatFeedback,
  listPins,
  pinMessage,
  unpin,
  sendMessage,
} from "./lib/api";
import { getCurrentBusiness, logout, type BusinessInfo } from "./lib/auth";
import type { ChatMessage, ChatSessionSummary, PinnedInsight, Policy, QuoteResult } from "./lib/types";

const GREETING: ChatMessage = {
  role: "assistant",
  content:
    "Hello! I'm Denney your AI commercial insurance broker. I can check what your business already has covered, spot gaps against the risks SMEs typically face, and get you illustrative quotes to fill any gaps. I can even tell if you're over insured or paying too much.\n\nHow can I help you today?",
};

export default function App() {
  const [authChecked, setAuthChecked] = useState(false);
  const [business, setBusiness] = useState<BusinessInfo | null>(null);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([GREETING]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [pins, setPins] = useState<PinnedInsight[]>([]);
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  // Assistant messages shown outside the chat loop, sent with the next turn so they're persisted
  const pendingNotes = useRef<string[]>([]);
  const [thinking, setThinking] = useState(false);
  // While a reply streams: what the broker is doing ("Searching your policies…"), and whether any text has arrived
  const [status, setStatus] = useState<string | null>(null);
  const [replyStarted, setReplyStarted] = useState(false);
  const [quote, setQuote] = useState<QuoteResult | null>(null);
  const [lastQuoteParams, setLastQuoteParams] = useState<{ toolName: string; args: Record<string, unknown> } | null>(null);
  const [quotePanelOpen, setQuotePanelOpen] = useState(false);
  const [requoting, setRequoting] = useState(false);
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null);
  const [prefillInput, setPrefillInput] = useState("");
  // Chat starts compact so the coverage panel gets the space; it opens up whenever the user
  // engages with it or something lands in it (a question, an analysis, a quote prompt).
  const [chatExpanded, setChatExpanded] = useState(false);
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

  const openSession = async (id: string) => {
    try {
      const { messages: history } = await getChatSession(id);
      setSessionId(id);
      setMessages([GREETING, ...history]);
      pendingNotes.current = [];
      const lastQuote = [...history].reverse().find((m) => m.quote)?.quote ?? null;
      setQuote(lastQuote);
      setLastQuoteParams(null);
      if (!lastQuote) setQuotePanelOpen(false);
    } catch {
      showToast("Couldn't load that conversation", false);
    }
  };

  const startNewChat = () => {
    setSessionId(null);
    setMessages([GREETING]);
    pendingNotes.current = [];
    setQuote(null);
    setLastQuoteParams(null);
    setQuotePanelOpen(false);
  };

  // Resume the most recent conversation on login
  const loadSessions = async (resumeLatest: boolean) => {
    try {
      const list = await listChatSessions();
      setSessions(list);
      if (resumeLatest && list.length) await openSession(list[0].id);
    } catch {
      /* start fresh */
    }
  };

  useEffect(() => {
    if (business) {
      loadPolicies();
      listPins().then(setPins).catch(() => {});
      loadSessions(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business?.business?.id]);

  const handleAuthenticated = () => {
    getCurrentBusiness().then(setBusiness);
  };

  const handleLogout = async () => {
    await logout();
    setBusiness(null);
    startNewChat();
    setSessions([]);
  };

  const handleBusinessNameUpdate = (name: string) => {
    setBusiness((prev) => (prev ? { ...prev, business: prev.business ? { ...prev.business, name } : prev.business } : prev));
  };

  const handleAnalysisComplete = (summary: string) => {
    setChatExpanded(true);
    setMessages((prev) => [...prev, { role: "assistant", content: summary }]);
    pendingNotes.current.push(summary);
  };

  const showToast = (text: string, ok = true) => {
    setToast({ text, ok });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  };

  const uploads = useUploadQueue(({ done, failed, skipped }) => {
    void loadPolicies();
    const parts = [];
    if (done) parts.push(`${done} document${done === 1 ? "" : "s"} uploaded`);
    if (failed) parts.push(`${failed} failed`);
    if (skipped.length) parts.push(`${skipped.length} skipped (not PDF)`);
    if (parts.length) showToast(parts.join(", "), failed === 0);
  });

  const handleSend = async (text: string) => {
    setChatExpanded(true);
    const userMessage: ChatMessage = { role: "user", content: text };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setThinking(true);
    setStatus(null);
    setReplyStarted(false);
    let streamed = "";
    try {
      const notes = pendingNotes.current;
      pendingNotes.current = [];
      const response = await sendMessage(sessionId, text, notes, {
        // Adopt the session straight away, so a turn interrupted mid-reply still continues the same conversation
        onSession: (id) => setSessionId(id),
        onStatus: setStatus,
        onText: (delta) => {
          streamed += delta;
          setStatus(null);
          setReplyStarted(true);
          setMessages([...nextMessages, { role: "assistant", content: streamed }]);
        },
      });
      setMessages([
        ...nextMessages,
        { id: response.message_id ?? undefined, role: "assistant", content: response.content, quote: response.quote },
      ]);
      if (response.session_id !== sessionId) loadSessions(false);
      if (response.quote) setQuote(response.quote);
      if (response.quoteToolName && response.quoteToolArgs) {
        setLastQuoteParams({ toolName: response.quoteToolName, args: response.quoteToolArgs });
      }
    } catch (err) {
      const error = `I encountered an error: ${err instanceof Error ? err.message : "Unknown error"}. Please try again.`;
      setMessages([
        ...nextMessages,
        { role: "assistant", content: streamed ? `${streamed}\n\n_${error}_` : error },
      ]);
    } finally {
      setThinking(false);
      setStatus(null);
      setReplyStarted(false);
    }
  };

  const handleFeedback = async (messageId: string, rating: 1 | -1) => {
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, rating } : m)));
    try {
      await sendChatFeedback(messageId, rating);
    } catch {
      showToast("Couldn't save feedback", false);
    }
  };

  const handleTogglePin = async (message: ChatMessage) => {
    if (!message.id) return;
    const existing = pins.find((p) => p.message_id === message.id);
    try {
      if (existing) {
        await unpin(existing.id);
        setPins((prev) => prev.filter((p) => p.id !== existing.id));
      } else {
        const pin = await pinMessage(message.id, message.content);
        setPins((prev) => [pin, ...prev.filter((p) => p.id !== pin.id)]);
        showToast("Pinned to Saved answers");
      }
    } catch {
      showToast("Couldn't update pin", false);
    }
  };

  const handleUnpin = async (id: string) => {
    try {
      await unpin(id);
      setPins((prev) => prev.filter((p) => p.id !== id));
    } catch {
      showToast("Couldn't unpin", false);
    }
  };

  const handleGetQuote = async (toolName: string, args: Record<string, unknown>) => {
    const newQuote = await requote(toolName, args);
    setQuote(newQuote);
    setLastQuoteParams({ toolName, args });
    setQuotePanelOpen(true);
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


  if (!authChecked) return <div className="h-full bg-slate-50" />;
  if (!business) return <LoginGate onAuthenticated={handleAuthenticated} />;

  return (
    <div className="h-full flex overflow-hidden bg-slate-50">
      {/* Left — Business Panel (takes whatever the chat doesn't) */}
      <aside className="flex-1 min-w-0 flex flex-col">
        <BusinessPanel
          business={business}
          policies={policies}
          uploads={uploads.items}
          uploadBusy={uploads.busy}
          onFiles={(files) => void uploads.enqueue(files)}
          onClearUploads={uploads.clearFinished}
          onPoliciesChanged={() => void loadPolicies()}
          onGetQuote={handleGetQuote}
          pins={pins}
          onUnpin={handleUnpin}
          onSendMessage={(prompt) => {
            setPrefillInput(prompt);
            setChatExpanded(true);
          }}
          onLogout={handleLogout}
          onBusinessNameUpdate={handleBusinessNameUpdate}
          onAnalysisComplete={handleAnalysisComplete}
        />
      </aside>

      {/* Right — Broker Chat: compact drawer by default, half the screen when expanded */}
      <main
        onFocusCapture={(e) => e.target instanceof HTMLTextAreaElement && setChatExpanded(true)}
        className={`flex-shrink-0 flex flex-col bg-white min-w-0 relative transition-[width] duration-300 ease-in-out ${
          chatExpanded ? "w-1/2" : "w-[24rem]"
        }`}
      >
        <Broker
          messages={messages}
          thinking={thinking}
          working={thinking && (!replyStarted || status !== null)}
          status={status}
          prefillInput={prefillInput}
          onPrefillConsumed={() => setPrefillInput("")}
          onSend={handleSend}
          onFiles={(files) => void uploads.enqueue(files)}
          onFeedback={handleFeedback}
          pinnedMessageIds={new Set(pins.map((p) => p.message_id).filter((id): id is string => !!id))}
          onTogglePin={handleTogglePin}
          sessions={sessions}
          currentSessionId={sessionId}
          onSelectSession={openSession}
          onNewChat={startNewChat}
          expanded={chatExpanded}
          onToggleExpanded={() => setChatExpanded((v) => !v)}
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
