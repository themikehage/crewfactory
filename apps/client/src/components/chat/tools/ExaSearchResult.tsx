import { useState } from "react";
import type { ToolResultData } from "./ToolCallRow";

interface Props {
  text: string;
  details?: ToolResultData["details"];
  l: Record<string, string>;
}

const VISIBLE_COUNT = 5;

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return dateStr;
  }
}

export function ExaSearchResult({ text, details, l }: Props) {
  const [showAll, setShowAll] = useState(false);
  const [synthOpen, setSynthOpen] = useState(false);

  const results = details?.results ?? [];
  const totalResults = details?.totalResults ?? results.length;
  const searchType = details?.searchType;
  const cost = details?.costDollars;
  const synthesized = details?.synthesizedOutput;

  if (totalResults === 0 && !text.trim()) {
    return <p className="text-muted-foreground text-xs italic">{l.bodyNoResults}</p>;
  }

  const visibleResults = showAll ? results : results.slice(0, VISIBLE_COUNT);
  const hiddenCount = results.length - VISIBLE_COUNT;

  return (
    <div className="flex flex-col gap-2 font-mono text-[11px]">
      <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
        <span className="text-highlight font-semibold">{totalResults} {l.resExaResults}</span>
        {searchType && (
          <span className="px-1.5 py-0.5 rounded bg-surface text-text-secondary text-[10px]">{searchType}</span>
        )}
        {cost != null && cost > 0 && (
          <span className="text-text-secondary text-[10px]">${cost.toFixed(4)}</span>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        {visibleResults.map((r, i) => (
          <div key={i} className="rounded-md border border-input/40 overflow-hidden">
            <div className="flex items-start gap-2 px-3 py-2 bg-card">
              <span className="text-muted-foreground flex-shrink-0 w-4 text-right select-none">{i + 1}.</span>
              <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                <a
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline font-semibold text-xs truncate block"
                >
                  {r.title || "Untitled"}
                </a>
                <div className="flex items-center gap-2 text-[10px] text-text-secondary">
                  <span className="truncate">{extractDomain(r.url)}</span>
                  {r.publishedDate && (
                    <>
                      <span className="text-border">|</span>
                      <span>{formatDate(r.publishedDate)}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {!showAll && hiddenCount > 0 && (
        <button
          onClick={() => setShowAll(true)}
          className="text-xs text-highlight hover:underline cursor-pointer text-left"
        >
          {l.bodyShowMore.replace("{n}", String(hiddenCount))}
        </button>
      )}

      {synthesized && (
        <div className="rounded-md border border-input/40 overflow-hidden">
          <button
            onClick={() => setSynthOpen(!synthOpen)}
            className="flex items-center gap-2 w-full px-3 py-1.5 bg-card hover:bg-card-hover/40 transition-colors text-left cursor-pointer"
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 20 20"
              fill="currentColor"
              className={`text-muted-foreground transition-transform ${synthOpen ? "rotate-90" : ""}`}
            >
              <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
            </svg>
            <span className="text-xs text-text-primary font-semibold">{l.bodySynthesizedOutput}</span>
          </button>
          {synthOpen && (
            <div className="px-3 py-2 border-t border-input/40 bg-bg text-text-secondary text-[11px] whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto">
              {synthesized}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
