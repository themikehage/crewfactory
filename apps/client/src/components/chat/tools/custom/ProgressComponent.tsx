interface ProgressProps {
  value: number; // 0 to 100
  label?: string;
  variant?: "bar" | "circle";
  showPercentage?: boolean;
}

export function ProgressComponent({ value, label, variant = "bar", showPercentage = true }: ProgressProps) {
  const percentage = Math.min(Math.max(value, 0), 100);

  if (variant === "circle") {
    const radius = 20;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (percentage / 100) * circumference;

    return (
      <div className="flex items-center gap-3 bg-card border border-border rounded-lg p-4 shadow-sm w-fit">
        <div className="relative flex items-center justify-center">
          <svg className="w-12 h-12 transform -rotate-90">
            <circle
              cx="24"
              cy="24"
              r={radius}
              className="stroke-muted"
              strokeWidth="4"
              fill="transparent"
            />
            <circle
              cx="24"
              cy="24"
              r={radius}
              className="stroke-primary transition-all duration-500 ease-out"
              strokeWidth="4"
              fill="transparent"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
            />
          </svg>
          {showPercentage && (
            <span className="absolute text-[10px] font-bold text-foreground">
              {percentage}%
            </span>
          )}
        </div>
        {label && (
          <span className="text-xs font-semibold text-muted-foreground">{label}</span>
        )}
      </div>
    );
  }

  // Horizontal bar variant (default)
  return (
    <div className="flex flex-col gap-1.5 w-full bg-card border border-border rounded-lg p-4 shadow-sm">
      <div className="flex justify-between items-center text-xs font-semibold text-muted-foreground">
        {label && <span>{label}</span>}
        {showPercentage && <span className="text-foreground ml-auto">{percentage}%</span>}
      </div>
      <div className="w-full bg-muted rounded-full h-2 overflow-hidden border border-border/55">
        <div
          className="bg-primary h-full rounded-full transition-all duration-500 ease-out"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
