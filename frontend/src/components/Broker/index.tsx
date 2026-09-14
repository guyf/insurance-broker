import type { ChatMessage } from "../../lib/types";
import { InputBar } from "./InputBar";
import { MessageList } from "./MessageList";

interface Props {
  messages: ChatMessage[];
  thinking: boolean;
  prefillInput: string;
  onPrefillConsumed: () => void;
  onSend: (text: string) => void;
}

export function Broker({ messages, thinking, prefillInput, onPrefillConsumed, onSend }: Props) {
  return (
    <div className="flex flex-col h-full">
      {/* Column header */}
      <div className="h-14 flex-shrink-0 border-b border-slate-100 flex items-center px-6">
        <span className="text-lg font-bold font-display text-slate-900">
          Broker Denney<span className="text-primary">.</span>
        </span>
      </div>

      <MessageList messages={messages} thinking={thinking} />

      <InputBar
        onSend={onSend}
        disabled={thinking}
        prefill={prefillInput}
        onPrefillConsumed={onPrefillConsumed}
      />
    </div>
  );
}
