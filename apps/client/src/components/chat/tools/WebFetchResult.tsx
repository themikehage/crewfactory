import { useState } from "react";

interface Props {
  text: string;
  details?: any;
  l: Record<string, string>;
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function formatBytes(bytes?: number): string {
  if (bytes == null) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function WebFetchResult({ text, details, l }: Props) {
  const [isOpen, setIsOpen] = useState(false);

  const url = details?.url || "";
  const title = details?.title || l.bodyWebFetchTitle;
  const isCached = !!details?.cached;
  const isTruncated = !!details?.truncated;
  const method = details?.extractionMethod || "readability";
  const duration = details?.fetchDurationMs;
  const originalSize = details?.originalSize;
  const extractedSize = details?.extractedSize;

  return (
    <div className="rounded-lg border border-border bg-surface overflow-hidden text-xs max-w-2xl font-sans my-1">
      {/* Header Panel */}
      <div className="p-3 flex items-start justify-between gap-3 bg-card/50">
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-text-primary truncate" title={title}>
            {title}
          </div>
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline text-[11px] truncate block mt-0.5"
            >
              {url}
            </a>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {isCached && (
            <span className="px-1.5 py-0.5 rounded bg-accent/10 text-accent font-semibold text-[10px]">
              {l.bodyWebFetchCached}
            </span>
          )}
          {isTruncated && (
            <span className="px-1.5 py-0.5 rounded bg-warning/10 text-warning font-semibold text-[10px]">
              {l.bodyWebFetchTruncated}
            </span>
          )}
          <span className="px-1.5 py-0.5 rounded bg-border text-text-secondary font-medium text-[10px] uppercase">
            {method}
          </span>
        </div>
      </div>

      {/* Info Grid */}
      <div className="px-3 py-2 border-t border-border grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-text-secondary bg-surface/30">
        <div>
          <span className="block text-muted-foreground font-medium">{l.bodyWebFetchOriginalSize}</span>
          <span className="font-mono text-text-primary">{formatBytes(originalSize)}</span>
        </div>
        <div>
          <span className="block text-muted-foreground font-medium">{l.bodyWebFetchExtractedSize}</span>
          <span className="font-mono text-text-primary">{formatBytes(extractedSize)}</span>
        </div>
        {duration != null && (
          <div>
            <span className="block text-muted-foreground font-medium">{l.bodyWebFetchTime}</span>
            <span className="font-mono text-text-primary">{duration}ms</span>
          </div>
        )}
        {url && (
          <div>
            <span className="block text-muted-foreground font-medium">Domain</span>
            <span className="truncate block text-text-primary" title={extractDomain(url)}>
              {extractDomain(url)}
            </span>
          </div>
        )}
      </div>

      {/* Toggle View Content */}
      <div className="border-t border-border">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center justify-between w-full px-3 py-2 bg-card hover:bg-surface-hover/30 transition-colors text-left cursor-pointer"
        >
          <span className="font-medium text-text-secondary">
            {isOpen ? l.bodyWebFetchHideContent : l.bodyWebFetchShowContent}
          </span>
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            className={`text-muted-foreground transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </button>

        {isOpen && (
          <div className="p-3 bg-bg border-t border-border text-[11px] leading-relaxed max-h-80 overflow-y-auto font-mono text-text-secondary select-all whitespace-pre-wrap">
            {text || "No content extracted."}
          </div>
        )}
      </div>
    </div>
  );
}
