import { useState } from "react";

interface CodeProps {
  code: string;
  language?: string;
  title?: string;
}

export function CodeComponent({ code, language, title }: CodeProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy code:", err);
    }
  };

  return (
    <div className="flex flex-col border border-border rounded-lg overflow-hidden bg-muted/30 text-xs w-full">
      <div className="bg-muted/70 px-4 py-2 border-b border-border/80 flex justify-between items-center text-muted-foreground font-mono text-[10px]">
        <span>{title || language || "code"}</span>
        <button
          onClick={handleCopy}
          className="hover:text-foreground hover:bg-muted p-1 rounded transition-colors"
          title="Copy Code"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="p-4 overflow-x-auto font-mono text-[11px] leading-relaxed text-foreground bg-card whitespace-pre">
        <code>{code}</code>
      </pre>
    </div>
  );
}
