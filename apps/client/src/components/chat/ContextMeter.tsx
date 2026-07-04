import { useState, useEffect } from "react";

interface ContextUsage {
  tokens: number | null;
  contextWindow: number | null;
  percent: number | null;
}

interface SessionStats {
  tokens: { input: number; output: number; total: number };
}

interface Props {
  contextUsage: ContextUsage | null;
  sessionStats: SessionStats | null;
  onCompact: () => void;
  onRefresh?: () => void;
}

export function ContextMeter({ contextUsage, sessionStats, onCompact, onRefresh }: Props) {
  const [open, setOpen] = useState(false);
  const [compacting, setCompacting] = useState(false);

  useEffect(() => {
    if (compacting) {
      const timer = setTimeout(() => setCompacting(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [compacting]);

  const showContextBar = contextUsage?.tokens != null && contextUsage?.contextWindow != null && contextUsage?.percent != null;
  const hasStats = sessionStats?.tokens?.total != null;

  if (!showContextBar && !hasStats) return null;

  const pct = contextUsage?.percent ?? 0;
  const barColor =
    pct >= 90 ? "bg-destructive" :
    pct >= 70 ? "bg-warning" :
    "bg-primary";

  const textColor =
    pct >= 90 ? "text-destructive" :
    pct >= 70 ? "text-warning" :
    "text-primary";

  const formatNum = (n: number) => n.toLocaleString();

  const handleCompact = () => {
    setCompacting(true);
    onCompact();
  };

  return (
    <div className="border-t border-border bg-background">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 sm:px-4 py-1.5 cursor-pointer hover:bg-card/50 transition-colors"
      >
        <svg
          width="10" height="10" viewBox="0 0 20 20" fill="currentColor"
          className={`text-muted-foreground transition-transform flex-shrink-0 ${open ? "rotate-90" : ""}`}
        >
          <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
        </svg>
        <div className="flex-1 flex items-center gap-2 min-w-0">
          {showContextBar && (
            <div className="flex-1 h-1 bg-card rounded-full overflow-hidden max-w-[120px]">
              <div
                className={`h-full rounded-full transition-all duration-300 ${barColor}`}
                style={{ width: `${Math.min(pct, 100)}%` }}
              />
            </div>
          )}
          {showContextBar && (
            <span className={`text-[10px] font-mono whitespace-nowrap ${textColor}`}>
              {Math.round(pct)}%
            </span>
          )}
          {showContextBar && (
            <span className="text-[10px] font-mono text-muted-foreground whitespace-nowrap">
              / {formatNum(contextUsage.contextWindow!)}
            </span>
          )}
        </div>
        <svg
          width="10" height="10" viewBox="0 0 20 20" fill="currentColor"
          className={`text-muted-foreground transition-transform flex-shrink-0 ${open ? "rotate-180" : ""}`}
        >
          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </button>

      {open && (
        <div className="px-3 sm:px-4 pb-2 flex items-center gap-3">
          <div className="text-[10px] font-mono">
            {showContextBar && (
              <span className={textColor}>
                {formatNum(contextUsage.tokens!)} / {formatNum(contextUsage.contextWindow!)} ({Math.round(pct)}%)
              </span>
            )}
            {hasStats && (
              <span className="text-muted-foreground">
                {" · "}Total: {formatNum(sessionStats.tokens.total)} ({formatNum(sessionStats.tokens.input)} in / {formatNum(sessionStats.tokens.output)} out)
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {onRefresh && (
              <button
                onClick={onRefresh}
                className="flex-shrink-0 p-1.5 rounded border border-input text-muted-foreground
                           hover:text-primary hover:border-primary transition-colors cursor-pointer"
                title="Refresh context usage"
              >
                <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                </svg>
              </button>
            )}
            <button
              onClick={handleCompact}
              disabled={compacting}
              className="flex-shrink-0 px-2.5 py-1 rounded border border-input text-[10px] font-semibold
                         text-muted-foreground hover:text-primary hover:border-primary disabled:opacity-50
                         disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              {compacting ? "Compacting..." : "Compact"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
