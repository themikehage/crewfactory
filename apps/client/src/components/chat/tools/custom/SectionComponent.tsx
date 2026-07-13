import type { ReactNode } from "react";

interface SectionProps {
  title: string;
  children: any[];
  renderChild: (comp: any, idx: number) => ReactNode;
}

export function SectionComponent({ title, children, renderChild }: SectionProps) {
  return (
    <div className="flex flex-col gap-2 w-full pt-1">
      <h3 className="text-xs font-bold tracking-wider text-muted-foreground uppercase border-b border-border/40 pb-1">
        {title}
      </h3>
      <div className="flex flex-col gap-3 py-1">
        {children.map((child, i) => renderChild(child, i))}
      </div>
    </div>
  );
}
