import type { ToolResultData } from "./ToolCallRow";

interface Props {
  mode: "recall" | "store" | "forget";
  args?: Record<string, unknown>;
  details?: ToolResultData["details"];
  l: Record<string, string>;
}

const TYPE_COLORS: Record<string, string> = {
  semantic: "text-accent bg-accent/10",
  episodic: "text-highlight bg-highlight/10",
  procedural: "text-warning bg-warning/10",
};

function ImportanceDots({ value }: { value: number }) {
  const filled = Math.round(value * 5);
  return (
    <span className="flex items-center gap-0.5">
      {Array.from({ length: 5 }, (_, i) => (
        <span
          key={i}
          className={`w-1.5 h-1.5 rounded-full ${i < filled ? "bg-accent" : "bg-border"}`}
        />
      ))}
    </span>
  );
}

function RecallView({ details, l }: { details?: ToolResultData["details"]; l: Record<string, string> }) {
  const memories = details?.memories ?? [];
  const count = details?.count ?? memories.length;

  if (count === 0) {
    return <p className="text-muted-foreground text-xs italic">{l.bodyNoMemories}</p>;
  }

  return (
    <div className="flex flex-col gap-1.5 font-mono text-[11px]">
      <div className="text-xs text-muted-foreground">
        <span className="text-accent font-semibold">{count}</span> {l.bodyMemoriesRecalled}
      </div>
      {memories.map((m) => {
        const colorClass = TYPE_COLORS[m.type] ?? "text-text-secondary bg-surface";
        return (
          <div key={m.id} className="rounded-md border border-input/40 overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-card border-b border-input/20">
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${colorClass}`}>
                {m.type}
              </span>
              <ImportanceDots value={m.importance} />
              <span className="text-text-secondary text-[10px] ml-auto font-mono truncate max-w-[120px]">
                {m.id}
              </span>
            </div>
            <div className="px-3 py-2 text-text-secondary text-[11px] whitespace-pre-wrap leading-relaxed max-h-32 overflow-y-auto">
              {m.content}
            </div>
            {m.tags && m.tags.length > 0 && (
              <div className="flex items-center gap-1 px-3 py-1.5 border-t border-input/20 bg-bg">
                {m.tags.map((tag) => (
                  <span key={tag} className="px-1.5 py-0.5 rounded bg-surface text-text-secondary text-[10px]">
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function StoreView({ args, details, l }: { args?: Record<string, unknown>; details?: ToolResultData["details"]; l: Record<string, string> }) {
  const type = details?.type ?? (args?.type as string) ?? "semantic";
  const importance = details?.importance ?? (args?.importance as number) ?? 0.5;
  const tags = details?.tags ?? (args?.tags as string[]) ?? [];
  const content = (args?.content as string) ?? "";
  const colorClass = TYPE_COLORS[type] ?? "text-text-secondary bg-surface";

  return (
    <div className="flex flex-col gap-1.5 font-mono text-[11px]">
      <div className="flex items-center gap-2 text-xs">
        <span className="text-accent font-semibold">{l.resStored}</span>
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${colorClass}`}>
          {type}
        </span>
        <ImportanceDots value={importance} />
      </div>
      {content && (
        <div className="px-3 py-2 rounded-md border border-input/40 bg-card text-text-secondary text-[11px] whitespace-pre-wrap leading-relaxed max-h-32 overflow-y-auto">
          {content}
        </div>
      )}
      {tags.length > 0 && (
        <div className="flex items-center gap-1">
          {tags.map((tag) => (
            <span key={tag} className="px-1.5 py-0.5 rounded bg-surface text-text-secondary text-[10px]">
              #{tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function ForgetView({ details, l }: { details?: ToolResultData["details"]; l: Record<string, string> }) {
  const id = details?.deletedId ?? "";
  return (
    <div className="font-mono text-[11px] text-text-secondary">
      <span className="text-error font-semibold">{l.resForgotten}</span>
      {id && <span className="ml-2 text-text-secondary">{id}</span>}
    </div>
  );
}

export function MemoryResult({ mode, args, details, l }: Props) {
  switch (mode) {
    case "recall":
      return <RecallView details={details} l={l} />;
    case "store":
      return <StoreView args={args} details={details} l={l} />;
    case "forget":
      return <ForgetView details={details} l={l} />;
  }
}
