import { useMemo } from "react";
import { type ContextUsage } from "@/lib";

interface ContextIndicatorProps {
  contextUsage: ContextUsage | null;
}

export function ContextIndicator({ contextUsage }: ContextIndicatorProps) {
  const show = contextUsage && contextUsage.totalTokens !== null && contextUsage.limit !== null;

  const formattedText = useMemo(() => {
    if (!show) return "";
    const formatter = new Intl.NumberFormat("en", {
      notation: "compact",
      maximumFractionDigits: 1,
    });
    return `${formatter.format(contextUsage.totalTokens!)} / ${formatter.format(contextUsage.limit!)}`;
  }, [contextUsage, show]);

  if (!show) return null;

  return (
    <span
      className="text-xs font-mono text-text-secondary select-none"
      aria-label={`${contextUsage.totalTokens} of ${contextUsage.limit} tokens used`}
    >
      {formattedText}
    </span>
  );
}

export function ContextProgressLine({ contextUsage }: ContextIndicatorProps) {
  const show = contextUsage && contextUsage.totalTokens !== null && contextUsage.limit !== null;

  if (!show) return null;

  const total = contextUsage.totalTokens!;
  const limit = contextUsage.limit!;
  const pct = limit > 0 ? (total / limit) * 100 : 0;
  const remainingPct = Math.max(0, 100 - pct);
  const barColor =
    remainingPct <= 10
      ? "bg-error"
      : remainingPct <= 30
      ? "bg-warning"
      : "bg-accent";

  return (
    <div className="w-full h-0.5 bg-border/20 overflow-hidden">
      <div
        className={`h-full transition-all duration-500 ${barColor}`}
        style={{ width: `${Math.min(remainingPct, 100)}%` }}
      />
    </div>
  );
}

