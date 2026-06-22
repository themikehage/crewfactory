import { openInWorkspace } from "./workspace";

interface GrepLine {
  type: "match" | "context";
  file: string;
  lineNum: number;
  content: string;
}

function parseGrepOutput(text: string): GrepLine[] {
  const lines: GrepLine[] = [];
  for (const raw of text.split("\n")) {
    if (!raw.trim()) continue;
    // Match line: file:linenum: content
    const matchResult = raw.match(/^(.+?):(\d+):\s?(.*)$/);
    if (matchResult) {
      lines.push({ type: "match", file: matchResult[1], lineNum: Number(matchResult[2]), content: matchResult[3] });
      continue;
    }
    // Context line: file-linenum- content
    const contextResult = raw.match(/^(.+?)-(\d+)-\s?(.*)$/);
    if (contextResult) {
      lines.push({ type: "context", file: contextResult[1], lineNum: Number(contextResult[2]), content: contextResult[3] });
    }
  }
  return lines;
}

function groupByFile(lines: GrepLine[]): Map<string, GrepLine[]> {
  const map = new Map<string, GrepLine[]>();
  for (const line of lines) {
    const existing = map.get(line.file) ?? [];
    existing.push(line);
    map.set(line.file, existing);
  }
  return map;
}

interface Props {
  text: string;
  args: Record<string, unknown>;
}

export function GrepResult({ text, args }: Props) {
  const pattern = (args.pattern as string) || "";
  const lines = parseGrepOutput(text);
  const byFile = groupByFile(lines);
  const matchCount = lines.filter(l => l.type === "match").length;

  if (lines.length === 0) {
    return <p className="text-text-secondary/50 text-xs italic">No matches found</p>;
  }

  return (
    <div className="space-y-2 font-mono text-[11px] w-full">
      <div className="text-[10px] text-text-secondary/50">
        {matchCount} match{matchCount !== 1 ? "es" : ""}
        {pattern ? ` for /${pattern}/` : ""}
      </div>
      {Array.from(byFile.entries()).map(([file, fileLines]) => {
        const fileMatches = fileLines.filter(l => l.type === "match").length;
        return (
          <div key={file} className="rounded-md overflow-hidden border border-surface-hover/40">
            <button
              key={file}
              onClick={() => openInWorkspace(file)}
              className="flex items-center gap-2 px-3 py-1 bg-surface border-b border-surface-hover/40 w-full text-left hover:bg-surface-hover/40 transition-colors cursor-pointer"
            >
              <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor" className="text-accent/60 flex-shrink-0">
                <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
              </svg>
              <span className="text-accent/80 text-[10px]">{file}</span>
              <span className="ml-auto text-text-secondary/40 text-[9px]">{fileMatches} match{fileMatches !== 1 ? "es" : ""}</span>
            </button>
            <div className="divide-y divide-surface-hover/20">
              {fileLines.map((line, i) => {
                const isMatch = line.type === "match";
                const highlighted = pattern
                  ? line.content.replace(
                      new RegExp(`(${pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"),
                      "|||$1|||"
                    )
                  : line.content;

                return (
                  <div
                    key={i}
                    className={`flex items-start gap-2 px-3 py-0.5 ${isMatch ? "bg-highlight/5" : ""}`}
                  >
                    <span className="text-text-secondary/30 w-6 flex-shrink-0 text-right select-none">
                      {line.lineNum}
                    </span>
                    <span className={isMatch ? "text-text-primary" : "text-text-secondary/50"}>
                      {highlighted.split("|||").map((part, j) =>
                        j % 2 === 1
                          ? <mark key={j} className="bg-highlight/25 text-highlight rounded-sm px-0.5">{part}</mark>
                          : part
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
