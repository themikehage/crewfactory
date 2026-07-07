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

  const currentTask = tasks.find((t) => t.id === currentTaskId);
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
    <div className="fixed top-20 inset-x-0 z-50 flex justify-center pointer-events-none">
    <div className="w-[92vw] max-w-sm bg-surface/95 border border-border/85 backdrop-blur-md shadow-md rounded-xl overflow-hidden font-sans text-xs flex flex-col transition-all duration-200 pointer-events-auto">
      {/* Header / Compressed View */}
      <div className="p-3 flex flex-col gap-2 bg-card/40">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="w-2 h-2 rounded-full bg-accent animate-pulse flex-shrink-0" />
            <span className="font-bold text-text-primary text-[11px] uppercase tracking-wider truncate">
              {isRunning ? "Task Exec Loop" : "Loop Paused"}
            </span>
          </div>

          <div className="flex items-center gap-1">
            {/* Pause/Resume Button */}
            <button
              onClick={handleToggle}
              disabled={loading}
              className={`p-1.5 rounded-lg border transition-all cursor-pointer flex-shrink-0 ${
                isRunning
                  ? "bg-amber-500/10 border-amber-500/35 text-amber-500 hover:bg-amber-500/20"
                  : "bg-primary/10 border-primary/35 text-primary hover:bg-primary/20"
              }`}
              title={isRunning ? "Pause Plan" : "Resume Plan"}
            >
              {isRunning ? (
                // Pause Icon
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <path fillRule="evenodd" d="M6.75 5.25a.75.75 0 0 1 .75-.75H9a.75.75 0 0 1 .75.75v13.5a.75.75 0 0 1-.75.75H7.5a.75.75 0 0 1-.75-.75V5.25Zm7.5 0A.75.75 0 0 1 15 4.5h1.5a.75.75 0 0 1 .75.75v13.5a.75.75 0 0 1-.75.75H15a.75.75 0 0 1-.75-.75V5.25Z" clipRule="evenodd" />
                </svg>
              ) : (
                // Play Icon
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <path fillRule="evenodd" d="M4.5 5.653c0-1.427 1.529-2.33 2.779-1.643l11.54 6.347c1.295.712 1.295 2.573 0 3.286L7.28 19.99c-1.25.687-2.779-.217-2.779-1.643V5.653Z" clipRule="evenodd" />
                </svg>
              )}
            </button>

            {/* Collapse/Expand Toggle */}
            <button
              onClick={() => setExpanded(!expanded)}
              className="p-1.5 rounded-lg border border-border/80 hover:bg-card-hover text-text-secondary hover:text-text-primary transition-all cursor-pointer flex-shrink-0"
            >
              <svg
                width="12"
                height="12"
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

        {/* Progress Bar & Numeric Indicator */}
        <div className="flex flex-col gap-1">
          <div className="flex justify-between items-center text-[10px] text-text-secondary font-mono">
            <span>{completedCount} / {totalCount} completed</span>
            <span>{Math.round(progressPercent)}%</span>
          </div>
          <div className="h-1.5 w-full bg-border/40 rounded-full overflow-hidden">
            <div
              className="h-full bg-accent transition-all duration-300 ease-out"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Active Task (If Expanded is False) */}
        {!expanded && currentTask && (
          <div className="mt-0.5 px-2.5 py-1.5 bg-bg/50 border border-border/40 rounded-lg flex flex-col gap-0.5">
            <span className="text-[9px] text-text-secondary font-mono uppercase tracking-wider">
              Running ({currentTask.id})
            </span>
            <span className="font-semibold text-text-primary text-[10.5px] truncate">
              {currentTask.title}
            </span>
          </div>
        )}
      </div>

      {/* Expanded Accordion Body */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: "auto" }}
            exit={{ height: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden border-t border-border/60"
          >
            <div className="p-3 bg-bg/25 flex flex-col gap-1.5 max-h-56 overflow-y-auto">
              {tasks.map((task) => {
                const isActive = task.id === currentTaskId;
                const isDone = task.status === "done";
                const isFailed = task.status === "failed";

                return (
                  <div
                    key={task.id}
                    className={`flex items-start gap-2.5 p-2 rounded-lg border transition-all ${
                      isActive
                        ? "bg-primary/5 border-primary/35 shadow-2xs"
                        : "bg-card/50 border-border/30"
                    }`}
                  >
                    {/* Status Dot/Icon */}
                    <div className="mt-0.5 flex-shrink-0">
                      {isDone ? (
                        <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor" className="text-accent">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                      ) : isFailed ? (
                        <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor" className="text-destructive">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                        </svg>
                      ) : isActive && isRunning ? (
                        <span className="relative flex h-2 w-2 mt-1">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                        </span>
                      ) : (
                        <span className="w-2 h-2 mt-1 rounded-full bg-muted-foreground/35 block" />
                      )}
                    </div>

                    {/* Task Title & Details */}
                    <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1.5">
                        <span className={`font-semibold text-[10.5px] truncate ${isDone ? "text-text-secondary line-through" : "text-text-primary"}`}>
                          {task.title}
                        </span>
                        <span className="font-mono text-[9px] font-bold text-muted-foreground/80 px-1 bg-muted/50 rounded-md">
                          {task.id}
                        </span>
                      </div>

                      {/* Small dependencies badge */}
                      {task.depends_on && task.depends_on.length > 0 && (
                        <span className="text-[9px] text-text-secondary font-mono">
                          Depends: {task.depends_on.join(", ")}
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
