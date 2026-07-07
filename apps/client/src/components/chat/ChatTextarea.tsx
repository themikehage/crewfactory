import { useEffect } from "react";

interface ChatTextareaProps {
  value: string;
  onChange: (value: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  placeholder: string;
  disabled: boolean;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
}

export function ChatTextarea({
  value,
  onChange,
  onKeyDown,
  placeholder,
  disabled,
  textareaRef,
}: ChatTextareaProps) {
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value, textareaRef]);

  return (
    <textarea
      ref={textareaRef}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      disabled={disabled}
      placeholder={placeholder}
      rows={1}
      className={`bg-transparent border-none outline-none resize-none w-full font-mono text-sm text-text-primary placeholder:text-muted-foreground/50 transition-opacity ${
        disabled ? "opacity-50 cursor-not-allowed" : ""
      }`}
    />
  );
}
