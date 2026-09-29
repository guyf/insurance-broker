import type { ChatMessage, ChatSessionSummary } from "../../lib/types";
import { InputBar } from "./InputBar";
import { MessageList } from "./MessageList";

interface Props {
  onFiles?: (files: File[]) => void;
  messages: ChatMessage[];
  /** A reply is in progress — input is disabled. */
  thinking: boolean;
  /** Show the working indicator: before any reply text arrives, or while a tool runs mid-reply. */
  working: boolean;
  status: string | null;
  prefillInput: string;
  onPrefillConsumed: () => void;
  onSend: (text: string) => void;
  onFeedback: (messageId: string, rating: 1 | -1) => void;
  pinnedMessageIds: Set<string>;
  onTogglePin: (message: ChatMessage) => void;
  sessions: ChatSessionSummary[];
  currentSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewChat: () => void;
}

export function Broker({
  messages,
  thinking,
  working,
  status,
  prefillInput,
  onPrefillConsumed,
  onSend,
  onFiles,
  onFeedback,
  pinnedMessageIds,
  onTogglePin,
  sessions,
  currentSessionId,
  onSelectSession,
  onNewChat,
}: Props) {
  return (
    <div className="flex flex-col h-full">
      {/* Column header */}
      <div className="h-14 flex-shrink-0 border-b border-slate-100 flex items-center gap-3 px-6">
        <span className="text-lg font-bold font-display text-slate-900 flex-shrink-0">
          Broker Denney<span className="text-primary">.</span>
        </span>
        <div className="ml-auto flex items-center gap-2 min-w-0">
          {sessions.length > 0 && (
            <select
              value={currentSessionId ?? ""}
              onChange={(e) => e.target.value && onSelectSession(e.target.value)}
              disabled={thinking}
              className="min-w-0 max-w-[14rem] truncate text-xs text-slate-600 bg-white border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-slate-400"
              title="Previous conversations"
            >
              {!currentSessionId && <option value="">New conversation</option>}
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title || "Untitled"} · {new Date(s.updated_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                </option>
              ))}
            </select>
          )}
          <button
            onClick={onNewChat}
            disabled={thinking || !currentSessionId}
            className="flex-shrink-0 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg px-2.5 py-1.5 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            New chat
          </button>
        </div>
      </div>

      <MessageList
        messages={messages}
        working={working}
        status={status}
        onFeedback={onFeedback}
        pinnedMessageIds={pinnedMessageIds}
        onTogglePin={onTogglePin}
      />

      <InputBar
        onSend={onSend}
        onFiles={onFiles}
        disabled={thinking}
        prefill={prefillInput}
        onPrefillConsumed={onPrefillConsumed}
      />
    </div>
  );
}
