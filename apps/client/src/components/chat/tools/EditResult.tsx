import { openInWorkspace } from "./workspace";

interface DiffLine {
  type: "add" | "remove" | "context" | "hunk";
  lineNum?: number;
  content: string;
}

function parseDiff(diff: string): DiffLine[] {
  const lines: DiffLine[] = [];
  for (const raw of diff.split("\n")) {
    if (raw.startsWith("@@")) {
      lines.push({ type: "hunk", content: raw });
      continue;
    }
    if (raw.startsWith("---") || raw.startsWith("+++")) continue;
    const sign = raw[0];
    if (sign === "+") {
      const rest = raw.slice(1);
      const spaceIdx = rest.indexOf(" ");
      const content = spaceIdx >= 0 ? rest.slice(spaceIdx + 1) : rest;
      const lineNum = spaceIdx >= 0 ? Number(rest.slice(0, spaceIdx)) : undefined;
      lines.push({ type: "add", lineNum, content });
    } else if (sign === "-") {
      const rest = raw.slice(1);
      const spaceIdx = rest.indexOf(" ");
      const content = spaceIdx >= 0 ? rest.slice(spaceIdx + 1) : rest;
      const lineNum = spaceIdx >= 0 ? Number(rest.slice(0, spaceIdx)) : undefined;
      lines.push({ type: "remove", lineNum, content });
    } else if (sign === " ") {
      const rest = raw.slice(1);
      const spaceIdx = rest.indexOf(" ");
      const content = spaceIdx >= 0 ? rest.slice(spaceIdx + 1) : rest;
      const lineNum = spaceIdx >= 0 ? Number(rest.slice(0, spaceIdx)) : undefined;
      lines.push({ type: "context", lineNum, content });
    }
  }
  return lines;
}

interface Props {
  text: string;
  filePath?: string;
  details?: {
    diff?: string;
    patch?: string;
    firstChangedLine?: number;
  };
  isError: boolean;
}

export function EditResult({ text, filePath, details, isError }: Props) {
  if (isError) {
    return (
      <div className="flex items-center gap-2 text-destructive text-xs font-mono">
        <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
        </svg>
        {text}
      </div>
    );
  }

  if (!details?.diff) {
    return (
      <div className="space-y-1.5">
        {filePath && (
          <button
            onClick={() => openInWorkspace(filePath)}
            className="font-mono text-[11px] text-primary/70 hover:text-primary hover:underline underline-offset-2 transition-colors cursor-pointer block"
          >
            {filePath}
          </button>
        )}
        <p className="text-primary text-xs font-mono">{text}</p>
      </div>
    );
  }

  const lines = parseDiff(details.diff);

  return (
    <div className="w-full space-y-1.5">
      {filePath && (
        <button
          onClick={() => openInWorkspace(filePath)}
          className="font-mono text-[11px] text-primary/70 hover:text-primary hover:underline underline-offset-2 transition-colors cursor-pointer block"
        >
          {filePath}
        </button>
      )}
      <div className="font-mono text-[11px] rounded-md overflow-hidden border border-input/40">
        {lines.map((line, i) => {
        if (line.type === "hunk") {
          return (
            <div key={i} className="px-3 py-0.5 bg-primary/5 text-primary/50 text-xs">
              {line.content}
            </div>
          );
        }
        const bgClass =
          line.type === "add" ? "bg-primary/8 border-l-2 border-success/50" :
          line.type === "remove" ? "bg-destructive/8 border-l-2 border-error/50" :
          "border-l-2 border-transparent";
        const textClass =
          line.type === "add" ? "text-primary" :
          line.type === "remove" ? "text-destructive/80" :
          "text-muted-foreground";
        const prefix =
          line.type === "add" ? "+" :
          line.type === "remove" ? "−" :
          " ";

        return (
          <div key={i} className={`flex items-start gap-2 px-3 py-0.5 ${bgClass}`}>
            {line.lineNum !== undefined && (
              <span className="text-muted-foreground w-5 flex-shrink-0 text-right select-none">
                {line.lineNum}
              </span>
            )}
            <span className={`flex-shrink-0 select-none ${textClass}`}>{prefix}</span>
            <span className={`break-all ${textClass}`}>{line.content}</span>
          </div>
        );
      })}
      </div>
    </div>
  );
}
