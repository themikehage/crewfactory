interface StatItem {
  label: string;
  value: string;
  change?: string;
  trend?: "up" | "down" | "neutral";
}

interface StatsProps {
  stats: StatItem[];
  title?: string;
  columns?: number;
}

export function StatsComponent({ stats, title, columns = 3 }: StatsProps) {
  const gridCols = {
    1: "grid-cols-1",
    2: "grid-cols-1 sm:grid-cols-2",
    3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
    4: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4",
  };

  const colClass = gridCols[columns as keyof typeof gridCols] || gridCols[3];

  const trendColors = {
    up: "text-success bg-success/10",
    down: "text-error bg-error/10",
    neutral: "text-muted-foreground bg-muted",
  };

  return (
    <div className="flex flex-col gap-2 w-full">
      {title && (
        <h3 className="text-xs font-bold tracking-wider text-muted-foreground uppercase mb-1">
          {title}
        </h3>
      )}
      <div className={`grid gap-3 w-full ${colClass}`}>
        {stats.map((stat, i) => (
          <div key={i} className="bg-card text-card-foreground border border-border rounded-lg p-4 shadow-sm flex flex-col justify-between min-w-[120px]">
            <span className="text-[9px] uppercase font-bold tracking-wider text-muted-foreground">{stat.label}</span>
            <span className="text-xl font-bold tracking-tight text-foreground mt-1">{stat.value}</span>
            {stat.change && (
              <div className="flex items-center gap-1.5 mt-2">
                <span className={`text-[9px] font-semibold px-1 rounded-sm ${
                  stat.trend ? trendColors[stat.trend] : "text-muted-foreground bg-muted"
                }`}>
                  {stat.change}
                </span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
