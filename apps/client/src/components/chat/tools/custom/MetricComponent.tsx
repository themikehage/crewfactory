interface MetricProps {
  label: string;
  value: string;
  trend?: "up" | "down" | "neutral";
  subtitle?: string;
}

export function MetricComponent({ label, value, trend, subtitle }: MetricProps) {
  const trendConfig = {
    up: {
      color: "text-success",
      icon: (
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25" />
        </svg>
      ),
    },
    down: {
      color: "text-error",
      icon: (
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 4.5l-15 15m0 0h11.25m-11.25 0V8.25" />
        </svg>
      ),
    },
    neutral: {
      color: "text-muted-foreground",
      icon: (
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M18 12H6" />
        </svg>
      ),
    },
  };

  return (
    <div className="bg-card text-card-foreground border border-border rounded-lg p-4 shadow-sm flex flex-col justify-between gap-1 min-w-[120px]">
      <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">{label}</span>
      <div className="flex items-baseline gap-2 mt-1">
        <span className="text-2xl font-bold tracking-tight text-foreground">{value}</span>
        {trend && trendConfig[trend] && (
          <span className={`inline-flex items-center ${trendConfig[trend].color}`} title={`Trend: ${trend}`}>
            {trendConfig[trend].icon}
          </span>
        )}
      </div>
      {subtitle && (
        <span className="text-[10px] text-muted-foreground mt-0.5">{subtitle}</span>
      )}
    </div>
  );
}
