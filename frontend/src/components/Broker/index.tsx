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

export function Broker({
  messages,
  thinking,
  prefillInput,
  onPrefillConsumed,
  onSend,
}: Props) {
  return (
    <div className="flex flex-col h-full">
      {/* Column header */}
      <div className="px-6 py-3 border-b border-panel-border flex-shrink-0">
        <h2 className="font-cormorant text-navy text-base font-semibold tracking-wide">
          Your Broker
        </h2>
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
