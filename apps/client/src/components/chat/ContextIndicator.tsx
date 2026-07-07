import { useMemo } from "react";

interface ContextUsage {
  tokens: number | null;
  contextWindow: number | null;
  percent: number | null;
}

interface ContextIndicatorProps {
  contextUsage: ContextUsage | null;
}

export function ContextIndicator({ contextUsage }: ContextIndicatorProps) {
  const show = contextUsage && contextUsage.tokens !== null && contextUsage.contextWindow !== null;

  const formattedText = useMemo(() => {
    if (!show) return "";
    const formatter = new Intl.NumberFormat("en", {
      notation: "compact",
      maximumFractionDigits: 1,
    });
    return `${formatter.format(contextUsage.tokens!)} / ${formatter.format(contextUsage.contextWindow!)}`;
  }, [contextUsage, show]);

  if (!show) return null;

  return (
    <span
      className="text-xs font-mono text-muted-foreground select-none"
      aria-label={`${contextUsage.tokens} of ${contextUsage.contextWindow} tokens used`}
    >
      {formattedText}
    </span>
  );
}

export function ContextProgressLine({ contextUsage }: ContextIndicatorProps) {
  const show = contextUsage && contextUsage.percent !== null;

  if (!show) return null;

  const pct = contextUsage.percent!;
  const remainingPct = Math.max(0, 100 - pct);
  const barColor =
    remainingPct <= 10
      ? "bg-destructive"
      : remainingPct <= 30
      ? "bg-warning"
      : "bg-primary";

  return (
    <div className="w-full h-0.5 bg-border/20 overflow-hidden">
      <div
        className={`h-full transition-all duration-500 ${barColor}`}
        style={{ width: `${Math.min(remainingPct, 100)}%` }}
      />
    </div>
  );
}
