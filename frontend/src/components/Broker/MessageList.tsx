import { useEffect, useRef } from "react";
import type { ChatMessage } from "../../lib/types";
import { Message, ThinkingIndicator } from "./Message";

interface Props {
  messages: ChatMessage[];
  thinking: boolean;
  onFeedback: (messageId: string, rating: 1 | -1) => void;
}

export function MessageList({ messages, thinking, onFeedback }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking]);

  return (
    <div className="flex-1 panel-scroll py-4">
      {messages.map((msg, i) => (
        <Message key={msg.id ?? i} message={msg} onFeedback={onFeedback} />
      ))}
      {thinking && <ThinkingIndicator />}
      <div ref={bottomRef} />
    </div>
  );
}
