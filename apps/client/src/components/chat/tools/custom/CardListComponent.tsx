import { CardComponent } from "./CardComponent";

interface CardListProps {
  title?: string;
  cards: Array<{
    title: string;
    description?: string;
    status?: "success" | "warning" | "error" | "info";
    action?: string;
    metadata?: Record<string, string>;
  }>;
  columns?: number;
}

export function CardListComponent({ title, cards, columns = 2 }: CardListProps) {
  const gridCols = {
    1: "grid-cols-1",
    2: "grid-cols-1 md:grid-cols-2",
    3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
    4: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4",
  };

  const colClass = gridCols[columns as keyof typeof gridCols] || gridCols[2];

  return (
    <div className="flex flex-col gap-2 w-full">
      {title && (
        <h3 className="text-xs font-bold tracking-wider text-muted-foreground uppercase mb-1">
          {title}
        </h3>
      )}
      <div className={`grid gap-3 w-full ${colClass}`}>
        {cards.map((card, i) => (
          <CardComponent key={i} {...card} />
        ))}
      </div>
    </div>
  );
}
