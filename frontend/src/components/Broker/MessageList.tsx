import { useEffect, useRef } from "react";
import type { ChatMessage } from "../../lib/types";
import { Message, ThinkingIndicator } from "./Message";

interface Props {
  messages: ChatMessage[];
  working: boolean;
  status: string | null;
  onFeedback: (messageId: string, rating: 1 | -1) => void;
  pinnedMessageIds: Set<string>;
  onTogglePin: (message: ChatMessage) => void;
}

export function MessageList({ messages, working, status, onFeedback, pinnedMessageIds, onTogglePin }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, working, status]);

  return (
    <div className="flex-1 panel-scroll py-4">
      {messages.map((msg, i) => (
        <Message
          key={msg.id ?? i}
          message={msg}
          onFeedback={onFeedback}
          pinned={!!msg.id && pinnedMessageIds.has(msg.id)}
          onTogglePin={onTogglePin}
        />
      ))}
      {working && <ThinkingIndicator status={status} />}
      <div ref={bottomRef} />
    </div>
  );
}
