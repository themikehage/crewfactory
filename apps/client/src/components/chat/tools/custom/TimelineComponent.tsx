interface TimelineItem {
  date?: string;
  title: string;
  description?: string;
  status?: "success" | "warning" | "error" | "info";
}

interface TimelineProps {
  items: TimelineItem[];
  title?: string;
}

export function TimelineComponent({ items, title }: TimelineProps) {
  const dotColors = {
    success: "bg-success border-success/20",
    warning: "bg-warning border-warning/20",
    error: "bg-error border-error/20",
    info: "bg-blue-500 border-blue-500/20",
    neutral: "bg-muted-foreground/50 border-border",
  };

  return (
    <div className="flex flex-col gap-2 w-full bg-card border border-border rounded-lg p-4 shadow-sm">
      {title && (
        <h3 className="text-xs font-bold tracking-wider text-muted-foreground uppercase mb-3 border-b border-border/40 pb-1">
          {title}
        </h3>
      )}
      <div className="flex flex-col relative pl-6 border-l border-border/70 ml-2 py-1 gap-5">
        {items.map((item, i) => {
          const colorClass = dotColors[item.status || "neutral"];
          return (
            <div key={i} className="relative flex flex-col items-start min-w-0">
              {/* Dot */}
              <div className={`w-3 h-3 rounded-full absolute left-[-24px] top-1 border-2 ${colorClass}`} />
              
              {/* Date */}
              {item.date && (
                <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">{item.date}</span>
              )}

              {/* Title */}
              <span className="text-xs font-semibold text-foreground mt-0.5 leading-snug">{item.title}</span>

              {/* Description */}
              {item.description && (
                <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed break-words max-w-full">
                  {item.description}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
