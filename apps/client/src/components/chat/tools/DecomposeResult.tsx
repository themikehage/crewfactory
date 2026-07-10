
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

export function DecomposeResult({ text, details, l }: Props) {
  const objective = details?.objective ?? "";
  const mode = details?.mode ?? "linear";
  const tasks = (details?.tasks as TaskItem[]) ?? [];
  const totalTasks = details?.totalTasks ?? tasks.length;

  if (tasks.length === 0) {
    return (
      <div className="text-muted-foreground text-xs italic bg-destructive/5 border border-destructive/20 p-3 rounded-lg text-destructive">
        {text ? text : l.bodyNoResults}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 font-sans text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-text-primary text-[13px]">
          {l.bodyTasksPlanned}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
            {mode}
          </span>
          <span className="text-[10px] font-mono text-muted-foreground">
            {totalTasks} tasks
          </span>
        </div>
      </div>

      {objective && (
        <p className="text-text-secondary leading-relaxed text-[11px]">
          <span className="font-semibold text-muted-foreground">{l.bodyObjective}: </span>
          {objective}
        </p>
      )}

      <div className="flex flex-col">
        {tasks.map((task, idx) => {
          const hasDeps = task.depends_on && task.depends_on.length > 0;
          return (
            <div
              key={task.id}
              className="group flex flex-col gap-1.5 py-2.5 border-t border-border/30 first:border-t-0"
            >
              <div className="flex items-center gap-2.5">
                <span className="flex items-center justify-center w-5 h-5 rounded-md bg-muted text-muted-foreground text-[10px] font-mono font-bold select-none flex-shrink-0">
                  {idx + 1}
                </span>
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="font-semibold text-text-primary text-[11.5px] truncate">
                    {task.title}
                  </span>
                  <span className="text-[9.5px] font-mono text-muted-foreground flex-shrink-0 opacity-60">
                    {task.id}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {task.estimated_steps && (
                    <span className="text-[9px] font-mono text-muted-foreground">
                      ~{task.estimated_steps} {l.bodyEstimatedSteps.toLowerCase()}
                    </span>
                  )}
                  {hasDeps && (
                    <span className="text-[9px] font-mono text-text-secondary">
                      {l.bodyDependsOn}: {task.depends_on!.join(", ")}
                    </span>
                  )}
                </div>
              </div>

              {task.prompt && (
                <div className="ml-7.5 text-[10px] text-muted-foreground leading-relaxed font-mono break-words whitespace-pre-wrap max-h-24 overflow-y-auto opacity-70 group-hover:opacity-100 transition-opacity">
                  {task.prompt}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
