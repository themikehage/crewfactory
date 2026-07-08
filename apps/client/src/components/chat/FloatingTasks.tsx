import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { TaskRunnerState } from "shared";

interface Props {
  tasksState: TaskRunnerState;
  onToggleStatus: (newStatus: "running" | "paused") => Promise<void>;
}

export function FloatingTasks({ tasksState, onToggleStatus }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);

  const { tasks = [], currentTaskId, status } = tasksState;

  if (tasks.length === 0 || status === "idle" || status === "completed") {
    return null;
  }

  const completedCount = tasks.filter((t) => t.status === "done").length;
  const totalCount = tasks.length;
  const progressPercent = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  const isRunning = status === "running";

  const handleToggle = async () => {
    setLoading(true);
    try {
      await onToggleStatus(isRunning ? "paused" : "running");
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="sticky top-0 z-10 -mx-3 sm:-mx-4 px-3 sm:px-4 pb-2 bg-bg">
      <div className="w-full bg-surface border border-border rounded-xl overflow-hidden font-sans text-xs flex flex-col shadow-md">
        <div className="px-3 py-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isRunning ? "bg-accent animate-pulse" : "bg-warning"}`} />
            <span className="font-semibold text-text-primary text-[11px] truncate">
              {isRunning ? "Ejecutando plan" : "Plan pausado"}
            </span>
            <span className="text-muted-foreground font-mono text-[10px] flex-shrink-0">
              {completedCount}/{totalCount}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={handleToggle}
              disabled={loading}
              className={`p-1 rounded-md border transition-all cursor-pointer flex-shrink-0 ${
                isRunning
                  ? "bg-amber-500/10 border-amber-500/30 text-amber-500 hover:bg-amber-500/20"
                  : "bg-primary/10 border-primary/30 text-primary hover:bg-primary/20"
              }`}
              title={isRunning ? "Pausar" : "Reanudar"}
            >
              {isRunning ? (
                <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                  <path fillRule="evenodd" d="M6.75 5.25a.75.75 0 0 1 .75-.75H9a.75.75 0 0 1 .75.75v13.5a.75.75 0 0 1-.75.75H7.5a.75.75 0 0 1-.75-.75V5.25Zm7.5 0A.75.75 0 0 1 15 4.5h1.5a.75.75 0 0 1 .75.75v13.5a.75.75 0 0 1-.75.75H15a.75.75 0 0 1-.75-.75V5.25Z" clipRule="evenodd" />
                </svg>
              ) : (
                <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                  <path fillRule="evenodd" d="M4.5 5.653c0-1.427 1.529-2.33 2.779-1.643l11.54 6.347c1.295.712 1.295 2.573 0 3.286L7.28 19.99c-1.25.687-2.779-.217-2.779-1.643V5.653Z" clipRule="evenodd" />
                </svg>
              )}
            </button>

            <button
              onClick={() => setExpanded(!expanded)}
              className="p-1 rounded-md border border-border/70 hover:bg-card-hover text-text-secondary hover:text-text-primary transition-all cursor-pointer flex-shrink-0"
            >
              <svg
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
          </div>
        </div>

        <div className="h-1 w-full bg-border/30">
          <div
            className="h-full bg-accent transition-all duration-300 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              initial={{ height: 0 }}
              animate={{ height: "auto" }}
              exit={{ height: 0 }}
              transition={{ duration: 0.15, ease: "easeInOut" }}
              className="overflow-hidden border-t border-border"
            >
              <div className="flex flex-col gap-px bg-border/20">
                {tasks.map((task) => {
                  const isActive = task.id === currentTaskId;
                  const isDone = task.status === "done";
                  const isFailed = task.status === "failed";

                  return (
                    <div
                      key={task.id}
                      className={`flex items-start gap-2.5 px-3 py-2 ${
                        isActive ? "bg-accent/5" : "bg-surface"
                      }`}
                    >
                      <div className="mt-0.5 flex-shrink-0">
                        {isDone ? (
                          <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor" className="text-accent">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                        ) : isFailed ? (
                          <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor" className="text-destructive">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                          </svg>
                        ) : isActive && isRunning ? (
                          <span className="relative flex h-2 w-2 mt-0.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                          </span>
                        ) : (
                          <span className="w-2 h-2 mt-1 rounded-full bg-muted-foreground/30 block" />
                        )}
                      </div>

                      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                        <span className={`font-medium text-[11px] truncate ${isDone ? "text-text-secondary line-through" : "text-text-primary"}`}>
                          {task.title}
                        </span>
                        {task.depends_on && task.depends_on.length > 0 && (
                          <span className="text-[9px] text-muted-foreground font-mono">
                            depende de: {task.depends_on.join(", ")}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
