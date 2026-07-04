interface Props {
  text: string;
  command: string;
  isError: boolean;
}

export function BashResult({ text, command, isError }: Props) {
  const cmdPreview = command.length > 80 ? command.slice(0, 80) + "…" : command;

  return (
    <div className="w-full rounded-md overflow-hidden border border-input/40">
      <div className="flex items-center gap-2 px-3 py-1.5 bg-muted border-b border-input/30">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground/50 flex-shrink-0">
          <polyline points="4 17 10 11 4 5" />
          <line x1="12" y1="19" x2="20" y2="19" />
        </svg>
        <span className="font-mono text-[10px] text-muted-foreground/50 truncate">{cmdPreview}</span>
        {isError && (
          <span className="ml-auto flex-shrink-0 text-[9px] font-semibold text-destructive uppercase tracking-wider">
            error
          </span>
        )}
      </div>
      <pre
        className={`font-mono text-[11px] leading-relaxed px-3 py-2.5 bg-muted max-h-64 overflow-y-auto whitespace-pre-wrap break-all ${
          isError ? "text-destructive/80" : "text-foreground"
        }`}
      >
        {text}
      </pre>
    </div>
  );
}
