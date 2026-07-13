interface TableProps {
  title?: string;
  columns: string[];
  rows: Array<Record<string, any>>;
  striped?: boolean;
}

export function TableComponent({ title, columns, rows, striped = true }: TableProps) {
  return (
    <div className="flex flex-col gap-2 w-full">
      {title && (
        <h3 className="text-xs font-bold tracking-wider text-muted-foreground uppercase mb-1">
          {title}
        </h3>
      )}
      <div className="overflow-x-auto border border-border rounded-lg shadow-sm w-full bg-card">
        <table className="min-w-full divide-y divide-border text-xs text-left">
          <thead className="bg-muted/50 text-muted-foreground font-semibold uppercase tracking-wider text-[10px]">
            <tr>
              {columns.map((col, i) => (
                <th key={i} className="px-4 py-3">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60 text-card-foreground">
            {rows.map((row, rIdx) => {
              const isEven = rIdx % 2 === 0;
              const rowClass = striped && !isEven ? "bg-muted/20" : "";
              return (
                <tr key={rIdx} className={`hover:bg-muted/10 transition-colors ${rowClass}`}>
                  {columns.map((col, cIdx) => {
                    const value = row[col] ?? row[col.toLowerCase()] ?? "";
                    return (
                      <td key={cIdx} className="px-4 py-2.5 whitespace-nowrap truncate max-w-[200px]" title={String(value)}>
                        {typeof value === "boolean" ? (value ? "true" : "false") : String(value)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
