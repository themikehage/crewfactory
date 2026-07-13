interface BadgeProps {
  text: string;
  variant?: "success" | "warning" | "error" | "info" | "neutral";
}

export function BadgeComponent({ text, variant = "neutral" }: BadgeProps) {
  const styles = {
    success: "bg-success/15 text-success border-success/20",
    warning: "bg-warning/15 text-warning border-warning/20",
    error: "bg-error/15 text-error border-error/20",
    info: "bg-blue-500/15 text-blue-400 border-blue-500/20",
    neutral: "bg-muted text-muted-foreground border-border",
  };

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${styles[variant]}`}>
      {text}
    </span>
  );
}
