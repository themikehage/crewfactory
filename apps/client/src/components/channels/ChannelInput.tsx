import { useState } from "react";

interface Props {
  onSend: (message: string) => Promise<void>;
}

export function ChannelInput({ onSend }: Props) {
  const [input, setInput] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSend = async () => {
    const msg = input.trim();
    if (!msg || submitting) return;
    setInput("");
    setSubmitting(true);
    try {
      await onSend(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-3 sm:p-4 bg-surface border-t border-surface-hover flex gap-2 items-center">
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
        placeholder="Send message to channel..."
        disabled={submitting}
        className="flex-1 bg-bg border border-surface-hover rounded-lg px-3.5 py-2.5 text-sm text-text-primary placeholder:text-text-secondary/40 focus:outline-none focus:border-accent/50 disabled:opacity-50"
      />
      <button
        onClick={handleSend}
        disabled={!input.trim() || submitting}
        className="px-4 py-2.5 text-sm font-medium bg-accent text-bg rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-40 flex items-center gap-1.5 flex-shrink-0"
      >
        <span>Send</span>
        <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
          <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
        </svg>
      </button>
    </div>
  );
}
