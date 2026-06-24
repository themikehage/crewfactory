import { useState, useEffect } from "react";

interface ContextUsage {
  tokens: number | null;
  contextWindow: number | null;
  percent: number | null;
}

interface Props {
  usage: ContextUsage | null;
  onCompact: () => void;
}

export function ContextMeter({ usage, onCompact }: Props) {
  const [compacting, setCompacting] = useState(false);

  useEffect(() => {
    if (compacting) {
      const timer = setTimeout(() => setCompacting(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [compacting]);

  if (!usage || usage.tokens === null || usage.contextWindow === null || usage.percent === null) {
    return null;
  }

  const pct = usage.percent;
  const color =
    pct >= 90 ? "bg-error" :
    pct >= 70 ? "bg-warning" :
    "bg-accent";

  const textColor =
    pct >= 90 ? "text-error" :
    pct >= 70 ? "text-warning" :
    "text-accent";

  const formatNum = (n: number) => n.toLocaleString();

  const handleCompact = () => {
    setCompacting(true);
    onCompact();
  };

  return (
    <div className="border-t border-surface px-3 sm:px-4 py-2 bg-bg">
      <div className="max-w-3xl mx-auto flex items-center gap-3">
        <div className="flex-1 flex flex-col gap-1 min-w-0">
          <div className="w-full h-1.5 bg-surface rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${color}`}
              style={{ width: `${Math.min(pct, 100)}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[10px] font-mono">
            <span className={textColor}>
              {formatNum(usage.tokens)} / {formatNum(usage.contextWindow)} tokens ({Math.round(pct)}%)
            </span>
          </div>
        </div>
        <button
          onClick={handleCompact}
          disabled={compacting}
          className="flex-shrink-0 px-2.5 py-1 rounded border border-surface-hover text-[10px] font-semibold
                     text-text-secondary hover:text-accent hover:border-accent disabled:opacity-50
                     disabled:cursor-not-allowed transition-colors cursor-pointer"
        >
          {compacting ? "Compacting..." : "Compact"}
        </button>
      </div>
    </div>
  );
}
