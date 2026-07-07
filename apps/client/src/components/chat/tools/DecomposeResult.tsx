
interface TaskItem {
  id: string;
  title: string;
  prompt: string;
  status: "pending" | "running" | "done" | "failed";
  depends_on?: string[];
  estimated_steps?: number;
}

interface Props {
  text: string;
  details?: any;
  l: Record<string, string>;
}

export function DecomposeResult({ details, l }: Props) {
  const objective = details?.objective ?? "";
  const mode = details?.mode ?? "linear";
  const tasks = (details?.tasks as TaskItem[]) ?? [];
  const totalTasks = details?.totalTasks ?? tasks.length;

  if (tasks.length === 0) {
    return (
      <div className="text-muted-foreground text-xs italic">
        {l.bodyNoResults}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 font-sans text-xs bg-bg/50 border border-border/80 rounded-xl p-4 shadow-sm">
      {/* Header */}
      <div className="flex flex-col gap-1.5 border-b border-border/50 pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="font-semibold text-text-primary text-[13px] tracking-wide">
            {l.bodyTasksPlanned}
          </span>
          <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-mono font-medium uppercase tracking-wider">
            {mode}
          </span>
        </div>
        {objective && (
          <div className="flex flex-col gap-0.5 mt-1 bg-card/60 p-2.5 rounded-lg border border-border/40">
            <span className="text-[10px] text-text-secondary font-mono uppercase tracking-wider">
              {l.bodyObjective}
            </span>
            <p className="text-text-primary font-medium leading-relaxed text-[11px]">
              {objective}
            </p>
          </div>
        )}
      </div>

      {/* Task List */}
      <div className="flex flex-col gap-2">
        {tasks.map((task, idx) => {
          const hasDeps = task.depends_on && task.depends_on.length > 0;
          return (
            <div
              key={task.id}
              className="group relative rounded-xl border border-border/50 bg-card hover:bg-card-hover/20 hover:border-border transition-all duration-200 p-3 flex flex-col gap-2 shadow-2xs"
            >
              {/* Task Title / Header */}
              <div className="flex items-start gap-2.5">
                <span className="flex items-center justify-center w-5 h-5 rounded-lg bg-muted text-muted-foreground text-[10px] font-mono font-bold select-none group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                  {idx + 1}
                </span>
                <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-text-primary text-[11.5px] truncate">
                      {task.title}
                    </span>
                    <span className="text-[9.5px] font-mono text-muted-foreground bg-muted/65 px-1.5 py-0.5 rounded-md font-bold flex-shrink-0">
                      {task.id}
                    </span>
                  </div>

                  {/* Badges line: Est Steps / Dependencies */}
                  <div className="flex items-center gap-2 flex-wrap mt-1">
                    {task.estimated_steps && (
                      <span className="inline-flex items-center gap-1 text-[9px] font-mono text-text-secondary bg-muted/50 px-1.5 py-0.5 rounded">
                        <span>{l.bodyEstimatedSteps}:</span>
                        <span className="font-bold text-text-primary">
                          {task.estimated_steps}
                        </span>
                      </span>
                    )}

                    {hasDeps && (
                      <div className="inline-flex items-center gap-1 flex-wrap text-[9px] text-text-secondary font-mono">
                        <span>{l.bodyDependsOn}:</span>
                        <div className="flex gap-1">
                          {task.depends_on!.map((depId) => (
                            <span
                              key={depId}
                              className="px-1 py-0.2 rounded bg-highlight/10 text-highlight font-bold border border-highlight/20"
                            >
                              {depId}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Task Detailed Prompt */}
              {task.prompt && (
                <div className="mt-1 px-3 py-2 bg-bg/40 border border-border/30 rounded-lg text-text-secondary leading-relaxed font-mono text-[10px] break-words whitespace-pre-wrap max-h-36 overflow-y-auto">
                  {task.prompt}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between text-[10px] text-text-secondary border-t border-border/40 pt-2 font-mono">
        <span>
          Total: <strong className="text-text-primary">{totalTasks}</strong>
        </span>
        <span className="text-primary/95 font-medium">Ready for execution</span>
      </div>
    </div>
  );
}
