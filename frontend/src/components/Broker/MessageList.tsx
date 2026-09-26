import { useEffect, useRef } from "react";
import type { ChatMessage } from "../../lib/types";
import { Message, ThinkingIndicator } from "./Message";

interface Props {
  messages: ChatMessage[];
  working: boolean;
  status: string | null;
  onFeedback: (messageId: string, rating: 1 | -1) => void;
}

export function MessageList({ messages, working, status, onFeedback }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, working, status]);

  return (
    <div className="flex-1 panel-scroll py-4">
      {messages.map((msg, i) => (
        <Message key={msg.id ?? i} message={msg} onFeedback={onFeedback} />
      ))}
      {working && <ThinkingIndicator status={status} />}
      <div ref={bottomRef} />
    </div>
  );
}
