import { type ButtonHTMLAttributes, type ReactNode, forwardRef } from "react";

type Variant = "solid" | "outline" | "ghost" | "destructive" | "accent" | "ghost-destructive";
type Size = "xs" | "sm" | "md" | "lg" | "icon";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}

const variants: Record<Variant, string> = {
  solid: "bg-background text-foreground border border-border hover:bg-primary/10 hover:border-primary/30",
  outline: "bg-transparent text-foreground border border-border hover:bg-primary/10",
  ghost: "bg-transparent text-foreground hover:bg-primary/10",
  destructive: "bg-destructive text-destructive-foreground hover:opacity-90",
  accent: "bg-primary text-primary-foreground hover:opacity-90",
  "ghost-destructive": "bg-transparent text-destructive hover:bg-destructive/10",
};

const sizes: Record<Size, string> = {
  xs: "px-2 py-1 text-[10px] rounded-md",
  sm: "px-2.5 py-1 text-xs rounded-md",
  md: "px-3 py-1.5 text-xs rounded-lg",
  lg: "px-4 py-2 text-sm rounded-lg",
  icon: "p-1.5 rounded-lg",
};

const base = "inline-flex items-center justify-center gap-1.5 font-semibold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed select-none";

export const Button = forwardRef<HTMLButtonElement, Props>(
  ({ variant = "solid", size = "md", className = "", children, ...props }, ref) => (
    <button
      ref={ref}
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
);

Button.displayName = "Button";
