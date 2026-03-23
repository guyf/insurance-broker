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
      <div className="h-12 flex-shrink-0 border-b border-gray-100 flex items-center px-6">
        <span className="text-sm font-medium text-gray-900">Your Broker</span>
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
