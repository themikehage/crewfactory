import { useState, useRef, useEffect, useCallback } from "react";
import { useLiterals } from "@/lib";
import { literals as u } from "./WelcomeChatInput.literals";
import { ModelSelector } from "./ModelSelector";

export interface SuggestionPill {
  label: string;
  icon?: React.ReactNode;
  promptText: string;
}

interface Props {
  title?: string;
  placeholder?: string;
  sessionId: string | null;
  onSend: (message: string, attachments?: File[]) => void;
  suggestions?: SuggestionPill[];
  showModelSelector?: boolean;
  selectedModel?: string;
  onModelChange?: (modelId: string) => void;
  allowAttachments?: boolean;
  disabled?: boolean;
  loading?: boolean;
  value?: string;
  onChange?: (val: string) => void;
}

export function WelcomeChatInput({
  title,
  placeholder,
  sessionId,
  selectedModel,
  onModelChange,
  onSend,
  suggestions = [],
  showModelSelector = true,
  allowAttachments = true,
  disabled = false,
  loading = false,
  value,
  onChange,
}: Props) {
  const l = useLiterals(u);
  const [internalInput, setInternalInput] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const input = value !== undefined ? value : internalInput;
  const setInput = onChange || setInternalInput;

  // Dynamic Time Greeting
  const getGreeting = useCallback(() => {
    const hours = new Date().getHours();
    if (hours < 12) return l.morningGreeting;
    if (hours < 18) return l.afternoonGreeting;
    return l.eveningGreeting;
  }, [l]);

  // Handle textarea autosize
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
  }, [input]);

  const handleSend = () => {
    if (disabled || loading || (!input.trim() && attachments.length === 0)) return;
    onSend(input, attachments);
    setInput("");
    setAttachments([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    setAttachments((prev) => [...prev, ...files]);
    e.target.value = "";
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="w-full max-w-3xl mx-auto flex flex-col items-center justify-center px-4 py-8 animate-fade-in">
      {/* Dynamic Header Greeting */}
      <h1 className="text-3xl sm:text-4xl font-display font-extrabold text-text-primary text-center mb-8 tracking-tight">
        {title || `${getGreeting()}`}
      </h1>

      {/* Floating Card Container */}
      <div
        className={`w-full bg-[#1a1a1a] border rounded-2xl p-4 transition-all duration-300 shadow-xl ${
          loading ? "border-accent/40 ring-1 ring-accent/20" : "border-border/50 hover:border-border/80 focus-within:border-accent focus-within:ring-1 focus-within:ring-accent/30"
        }`}
      >
        {/* Attachment Preview Grid */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3 pb-3 border-b border-border/40">
            {attachments.map((file, idx) => (
              <div
                key={idx}
                className="flex items-center gap-1.5 bg-background/55 border border-border/60 rounded-lg px-2.5 py-1 text-xs text-text-secondary"
              >
                <span className="truncate max-w-[150px] font-mono">{file.name}</span>
                <button
                  type="button"
                  onClick={() => removeAttachment(idx)}
                  className="text-text-secondary/60 hover:text-error transition-colors cursor-pointer"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Text Input area */}
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder || l.defaultPlaceholder}
          disabled={disabled || loading}
          rows={2}
          className="w-full bg-transparent text-text-primary placeholder:text-text-secondary/50 focus:outline-none resize-none text-sm leading-relaxed max-h-[200px]"
        />

        {/* Toolbar Controls */}
        <div className="flex items-center justify-between mt-3 pt-2 border-t border-border/30">
          <div className="flex items-center gap-2">
            {/* Attachment Button */}
            {allowAttachments && (
              <>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={disabled || loading}
                  className="p-2 hover:bg-surface-hover text-text-secondary hover:text-text-primary rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                  </svg>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  onChange={handleFileChange}
                  className="hidden"
                />
              </>
            )}

            {/* Model Selector integration */}
            {showModelSelector && (
              <div className="flex items-center gap-1.5 ml-2 border-l border-border/40 pl-2">
                <ModelSelector
                  sessionId={sessionId}
                  disabled={disabled || loading}
                  value={selectedModel}
                  onChange={onModelChange}
                />
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Submit Prompt Button */}
            <button
              type="button"
              onClick={handleSend}
              disabled={disabled || loading || (!input.trim() && attachments.length === 0)}
              className="p-2 bg-accent hover:bg-accent/90 disabled:bg-surface-hover disabled:text-text-secondary/40 text-background rounded-lg transition-all cursor-pointer font-semibold shadow-md shadow-accent/15"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Suggestion Pills underneath input */}
      {suggestions.length > 0 && (
        <div className="w-full flex items-center justify-center gap-2 mt-5 overflow-x-auto flex-nowrap sm:flex-wrap pb-2 no-scrollbar">
          {suggestions.map((pill, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => {
                if (!disabled && !loading) {
                  onSend(pill.promptText, []);
                }
              }}
              disabled={disabled || loading}
              className="flex items-center gap-2 bg-surface hover:bg-surface-hover border border-border/80 text-text-primary px-3 py-1.5 rounded-full text-xs font-semibold hover:border-accent/40 transition-all cursor-pointer whitespace-nowrap disabled:opacity-50"
            >
              {pill.icon}
              <span>{pill.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
