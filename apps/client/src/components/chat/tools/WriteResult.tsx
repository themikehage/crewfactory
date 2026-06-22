import { openInWorkspace } from "./workspace";

interface Props {
  text: string;
  isError: boolean;
}

export function WriteResult({ text, isError }: Props) {
  const bytesMatch = text.match(/(\d+)\s+bytes/);
  const pathMatch = text.match(/to\s+(.+)$/);
  const bytes = bytesMatch ? Number(bytesMatch[1]) : null;
  const path = pathMatch ? pathMatch[1].trim() : null;

  if (isError) {
    return (
      <div className="flex items-center gap-2 text-error text-xs">
        <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
        </svg>
        <span className="font-mono">{text}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-1.5">
        <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" className="text-success flex-shrink-0">
          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
        </svg>
        <span className="text-success text-xs font-semibold">Written</span>
      </div>
      {path && (
        <button
          onClick={() => openInWorkspace(path)}
          className="font-mono text-[11px] text-accent/80 hover:underline underline-offset-2 truncate cursor-pointer hover:text-accent transition-colors"
        >
          {path}
        </button>
      )}
      {bytes !== null && (
        <span className="text-[10px] text-text-secondary/50 ml-auto flex-shrink-0 font-mono">
          {bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`}
        </span>
      )}
    </div>
  );
}
