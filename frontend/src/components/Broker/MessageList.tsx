import { useEffect, useRef } from "react";
import type { ChatMessage } from "../../lib/types";
import { Message, ThinkingIndicator } from "./Message";

interface Props {
  messages: ChatMessage[];
  thinking: boolean;
}

export function MessageList({ messages, thinking }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking]);

  return (
    <div className="flex-1 panel-scroll py-4">
      {messages.map((msg, i) => (
        <Message key={i} message={msg} />
      ))}
      {thinking && <ThinkingIndicator />}
      <div ref={bottomRef} />
    </div>
  );
}
