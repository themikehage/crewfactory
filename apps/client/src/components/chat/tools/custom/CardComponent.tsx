interface CardProps {
  title: string;
  description?: string;
  status?: "success" | "warning" | "error" | "info";
  action?: string;
  metadata?: Record<string, string>;
}

export function CardComponent({ title, description, status, action, metadata }: CardProps) {
  const statusBorders = {
    success: "border-l-4 border-l-success border-border",
    warning: "border-l-4 border-l-warning border-border",
    error: "border-l-4 border-l-error border-border",
    info: "border-l-4 border-l-blue-500 border-border",
  };

  const cardBorder = status ? statusBorders[status] : "border-border";

  return (
    <div className={`bg-card text-card-foreground border rounded-lg p-4 shadow-sm flex flex-col gap-2 ${cardBorder}`}>
      <div className="flex justify-between items-start gap-4">
        <h4 className="font-semibold text-sm text-foreground">{title}</h4>
        {status && (
          <span className={`text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded ${
            status === "success" ? "bg-success/10 text-success" :
            status === "warning" ? "bg-warning/10 text-warning" :
            status === "error" ? "bg-error/10 text-error" : "bg-blue-500/10 text-blue-400"
          }`}>
            {status}
          </span>
        )}
      </div>
      
      {description && (
        <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
      )}

      {metadata && Object.keys(metadata).length > 0 && (
        <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-border/50 text-[11px]">
          {Object.entries(metadata).map(([key, val]) => (
            <div key={key} className="flex flex-col">
              <span className="text-muted-foreground font-medium">{key}</span>
              <span className="text-foreground truncate" title={val}>{val}</span>
            </div>
          ))}
        </div>
      )}

      {action && (
        <div className="mt-2 flex justify-end">
          <span className="text-xs font-semibold text-primary hover:underline cursor-pointer">
            {action}
          </span>
        </div>
      )}
    </div>
  );
}
