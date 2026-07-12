import { useMemo } from "react";
import { Zap } from "lucide-react";
import { useLiterals, type ContextUsage } from "@/lib";
import { literals as u } from "./ContextMeter.literals";

interface ContextIndicatorProps {
  contextUsage: ContextUsage | null;
  onCompact?: () => void;
  compacting?: boolean;
}

export function ContextIndicator({ contextUsage, onCompact, compacting = false }: ContextIndicatorProps) {
  const l = useLiterals(u);
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
    <div className="flex items-center gap-1.5 select-none">
      <span
        className="text-xs font-mono text-text-secondary"
        aria-label={`${contextUsage.totalTokens} of ${contextUsage.limit} tokens used`}
      >
        {formattedText}
      </span>
      {onCompact && (
        <button
          type="button"
          onClick={onCompact}
          disabled={compacting}
          className="p-1 rounded-md text-text-secondary hover:text-accent hover:bg-surface-hover/30 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
          title={compacting ? l.compacting : l.compact}
        >
          <Zap size={11} className={compacting ? "animate-pulse text-accent" : ""} />
        </button>
      )}
    </div>
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

