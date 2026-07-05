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
}

export function ContextMeter({ contextUsage }: Props) {
  const showContextBar = contextUsage?.tokens != null && contextUsage?.contextWindow != null && contextUsage?.percent != null;

  if (!showContextBar) return null;

  const pct = contextUsage.percent!;
  const barColor =
    pct >= 90 ? "bg-destructive" :
    pct >= 70 ? "bg-warning" :
    "bg-primary";

  const formatNum = (n: number) => n.toLocaleString();

  return (
    <div className="border-t border-border bg-background">
      <div className="max-w-3xl mx-auto flex items-center gap-2 px-3 sm:px-4 py-1.5 min-w-0">
        <div className="flex-1 h-1 bg-card rounded-full overflow-hidden max-w-[100px]">
          <div
            className={`h-full rounded-full transition-all duration-300 ${barColor}`}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
        <span className="text-xs font-mono whitespace-nowrap text-muted-foreground">
          {formatNum(contextUsage.tokens!)} / {formatNum(contextUsage.contextWindow!)} ({Math.round(pct)}%)
        </span>
      </div>
    </div>
  );
}
