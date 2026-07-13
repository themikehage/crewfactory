interface StepItem {
  label: string;
  status: "done" | "active" | "pending" | "error";
  description?: string;
}

interface StepsProps {
  steps: StepItem[];
  direction?: "horizontal" | "vertical";
}

export function StepsComponent({ steps, direction = "vertical" }: StepsProps) {
  const isHorizontal = direction === "horizontal";

  const statusColors = {
    done: {
      bg: "bg-success",
      border: "border-success",
      text: "text-success",
      icon: (
        <svg className="w-3 h-3 text-success-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      ),
    },
    active: {
      bg: "bg-primary animate-pulse",
      border: "border-primary",
      text: "text-primary",
      icon: <span className="w-1.5 h-1.5 rounded-full bg-primary-foreground" />,
    },
    error: {
      bg: "bg-error",
      border: "border-error",
      text: "text-error",
      icon: (
        <svg className="w-3 h-3 text-error-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      ),
    },
    pending: {
      bg: "bg-muted",
      border: "border-muted-foreground/30",
      text: "text-muted-foreground",
      icon: null,
    },
  };

  if (isHorizontal) {
    return (
      <div className="flex items-center justify-between w-full bg-card border border-border rounded-lg p-4 shadow-sm overflow-x-auto gap-4">
        {steps.map((step, i) => {
          const cfg = statusColors[step.status] || statusColors.pending;
          const isLast = i === steps.length - 1;

          return (
            <div key={i} className="flex-1 flex items-center gap-2 min-w-[120px]">
              <div className="flex flex-col items-center gap-1">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center border ${cfg.bg} ${cfg.border} text-xs font-bold`}>
                  {cfg.icon}
                </div>
                <div className="text-center">
                  <span className={`text-[10px] font-semibold block truncate ${cfg.text}`}>{step.label}</span>
                  {step.description && (
                    <span className="text-[8px] text-muted-foreground block max-w-[100px] truncate">{step.description}</span>
                  )}
                </div>
              </div>
              {!isLast && (
                <div className={`flex-1 h-0.5 border-t-2 border-dashed ${
                  step.status === "done" ? "border-success/50" : "border-border"
                } mx-2`} />
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // Vertical layout (default)
  return (
    <div className="flex flex-col w-full bg-card border border-border rounded-lg p-4 shadow-sm gap-4">
      {steps.map((step, i) => {
        const cfg = statusColors[step.status] || statusColors.pending;
        const isLast = i === steps.length - 1;

        return (
          <div key={i} className="flex gap-3 relative items-start">
            {/* Left dot + line */}
            <div className="flex flex-col items-center flex-shrink-0 relative">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center border ${cfg.bg} ${cfg.border}`}>
                {cfg.icon}
              </div>
              {!isLast && (
                <div className={`w-0.5 absolute top-5 bottom-[-16px] border-l-2 ${
                  step.status === "done" ? "border-success/30" : "border-border"
                }`} />
              )}
            </div>

            {/* Step texts */}
            <div className="flex flex-col min-w-0">
              <span className={`text-xs font-semibold ${cfg.text}`}>{step.label}</span>
              {step.description && (
                <span className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">{step.description}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
