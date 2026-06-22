import { useState, useEffect, useCallback, useRef } from "react";
import { useWebSocket } from "@/hooks/useWebSocket";
import type { TaskRun, TaskItem, RunStatus } from "shared";

interface Props {
  sessionId: string | null;
}

function StatusIcon({ status }: { status: TaskItem["status"] | RunStatus }) {
  if (status === "running") {
    return (
      <span className="inline-block w-3.5 h-3.5 border-2 border-accent border-t-transparent rounded-full animate-spin flex-shrink-0" />
    );
  }
  if (status === "done") {
    return (
      <svg className="w-3.5 h-3.5 text-success flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
      </svg>
    );
  }
  if (status === "failed") {
    return (
      <svg className="w-3.5 h-3.5 text-error flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
      </svg>
    );
  }
  if (status === "paused") {
    return (
      <svg className="w-3.5 h-3.5 text-warning flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
      </svg>
    );
  }
  return <span className="w-3.5 h-3.5 rounded-full border border-surface-hover flex-shrink-0" />;
}

function RunStatusBadge({ status }: { status: RunStatus }) {
  const map: Record<RunStatus, { label: string; className: string }> = {
    running: { label: "Running", className: "bg-accent/10 text-accent" },
    paused: { label: "Paused", className: "bg-warning/10 text-warning" },
    done: { label: "Done", className: "bg-success/10 text-success" },
    failed: { label: "Failed", className: "bg-error/10 text-error" },
  };
  const { label, className } = map[status];
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${className}`}>
      {label}
    </span>
  );
}

export function TaskPanel({ sessionId }: Props) {
  const [taskRun, setTaskRun] = useState<TaskRun | null>(null);
  const [loading, setLoading] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [objective, setObjective] = useState("");
  const [expanded, setExpanded] = useState(true);
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());
  const [decomposing, setDecomposing] = useState(false);
  const { subscribe, send } = useWebSocket(sessionId);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const loadTasks = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/sessions/${sessionId}/tasks`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setTaskRun(data);
      }
    } catch {
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  useEffect(() => {
    if (!sessionId) return;

    const unsubDecomposing = subscribe("task_decomposing", () => {
      setDecomposing(true);
    });

    const unsubStart = subscribe("task_run_start", (data: unknown) => {
      setDecomposing(false);
      const evt = data as TaskRun & { tasks: TaskItem[] };
      setTaskRun((prev) => ({
        ...(prev ?? {}),
        ...evt,
        status: "running",
      } as TaskRun));
      setLaunching(false);
    });

    const unsubStepStart = subscribe("task_step_start", (data: unknown) => {
      const evt = data as { taskIndex: number };
      setTaskRun((prev) => {
        if (!prev) return prev;
        const tasks = [...prev.tasks];
        if (tasks[evt.taskIndex]) {
          tasks[evt.taskIndex] = { ...tasks[evt.taskIndex], status: "running", startedAt: new Date().toISOString() };
        }
        return { ...prev, status: "running", currentTaskIndex: evt.taskIndex, tasks };
      });
    });

    const unsubStepDone = subscribe("task_step_done", (data: unknown) => {
      const evt = data as { taskIndex: number; log: string };
      setTaskRun((prev) => {
        if (!prev) return prev;
        const tasks = [...prev.tasks];
        if (tasks[evt.taskIndex]) {
          tasks[evt.taskIndex] = {
            ...tasks[evt.taskIndex],
            status: "done",
            log: evt.log,
            completedAt: new Date().toISOString(),
          };
        }
        return { ...prev, tasks };
      });
    });

    const unsubStepFailed = subscribe("task_step_failed", (data: unknown) => {
      const evt = data as { taskIndex: number };
      setTaskRun((prev) => {
        if (!prev) return prev;
        const tasks = [...prev.tasks];
        if (tasks[evt.taskIndex]) {
          tasks[evt.taskIndex] = { ...tasks[evt.taskIndex], status: "failed" };
        }
        return { ...prev, tasks };
      });
    });

    const unsubPaused = subscribe("task_run_paused", () => {
      setTaskRun((prev) => prev ? { ...prev, status: "paused" } : prev);
    });

    const unsubDone = subscribe("task_run_done", () => {
      setTaskRun((prev) => prev ? { ...prev, status: "done" } : prev);
    });

    const unsubFailed = subscribe("task_run_failed", () => {
      setTaskRun((prev) => prev ? { ...prev, status: "failed" } : prev);
    });

    return () => {
      unsubDecomposing();
      unsubStart();
      unsubStepStart();
      unsubStepDone();
      unsubStepFailed();
      unsubPaused();
      unsubDone();
      unsubFailed();
    };
  }, [sessionId, subscribe]);

  const handleLaunch = async () => {
    if (!objective.trim() || !sessionId) return;
    setLaunching(true);
    setDecomposing(true);
    try {
      const token = localStorage.getItem("token");
      await fetch(`/api/sessions/${sessionId}/task`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ objective: objective.trim() }),
      });
      setObjective("");
    } catch {
      setLaunching(false);
      setDecomposing(false);
    }
  };

  const handlePause = () => send({ type: "task_pause", sessionId });
  const handleResume = () => send({ type: "task_resume", sessionId });
  const handleCancel = async () => {
    if (!sessionId) return;
    const token = localStorage.getItem("token");
    await fetch(`/api/sessions/${sessionId}/task`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    setTaskRun(null);
  };

  const toggleLog = (id: string) => {
    setExpandedLogs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("taskRunStatusChange", { detail: { status: taskRun?.status ?? null } })
    );
  }, [taskRun?.status]);

  const doneCount = taskRun?.tasks.filter((t) => t.status === "done").length ?? 0;
  const totalCount = taskRun?.tasks.length ?? 0;
  const progress = totalCount > 0 ? (doneCount / totalCount) * 100 : 0;

  if (!sessionId) return null;

  return (
    <div className="border-t border-surface">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
            <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
            <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
          </svg>
          <span className="font-semibold">Tasks</span>
          {taskRun && <RunStatusBadge status={taskRun.status} />}
        </div>
        <svg
          width="10" height="10" viewBox="0 0 20 20" fill="currentColor"
          className={`transition-transform ${expanded ? "rotate-180" : ""}`}
        >
          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-3">
          {!taskRun || taskRun.status === "done" || taskRun.status === "failed" ? (
            <div className="space-y-2">
              {taskRun && taskRun.status !== "done" && (
                <div className="text-[10px] text-text-secondary/60 italic truncate">
                  Last: {taskRun.objective}
                </div>
              )}
              <textarea
                ref={textareaRef}
                value={objective}
                onChange={(e) => setObjective(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleLaunch();
                  }
                }}
                placeholder="Describe the objective... (Enter to launch)"
                rows={2}
                className="w-full px-2 py-1.5 bg-surface border border-surface-hover rounded-md text-text-primary placeholder-text-secondary text-xs resize-none outline-none focus:border-accent transition-colors font-mono"
              />
              <button
                onClick={handleLaunch}
                disabled={launching || !objective.trim()}
                className="w-full py-1.5 text-xs bg-accent text-bg rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity font-semibold cursor-pointer"
              >
                {decomposing ? "Decomposing..." : launching ? "Launching..." : "Launch Task Run"}
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="text-[10px] text-text-secondary leading-tight truncate" title={taskRun.objective}>
                {taskRun.objective}
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px] text-text-secondary">
                  <span>{doneCount}/{totalCount} steps</span>
                  <span>{Math.round(progress)}%</span>
                </div>
                <div className="h-1 bg-surface-hover rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent rounded-full transition-all duration-500"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>

              <div className="flex gap-1.5">
                {taskRun.status === "running" && (
                  <button
                    onClick={handlePause}
                    className="flex-1 py-1 text-[10px] bg-warning/10 text-warning border border-warning/20 rounded-md hover:bg-warning/20 transition-colors cursor-pointer font-semibold"
                  >
                    Pause
                  </button>
                )}
                {taskRun.status === "paused" && (
                  <button
                    onClick={handleResume}
                    className="flex-1 py-1 text-[10px] bg-accent/10 text-accent border border-accent/20 rounded-md hover:bg-accent/20 transition-colors cursor-pointer font-semibold"
                  >
                    Resume
                  </button>
                )}
                <button
                  onClick={handleCancel}
                  className="flex-1 py-1 text-[10px] bg-error/10 text-error border border-error/20 rounded-md hover:bg-error/20 transition-colors cursor-pointer font-semibold"
                >
                  Cancel
                </button>
              </div>

              <div className="space-y-1 max-h-48 overflow-y-auto">
                {taskRun.tasks.map((task, i) => (
                  <div key={task.id} className="rounded-md bg-surface overflow-hidden">
                    <button
                      onClick={() => task.log ? toggleLog(task.id) : undefined}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 text-left ${task.log ? "cursor-pointer hover:bg-surface-hover" : "cursor-default"} transition-colors`}
                    >
                      <StatusIcon status={task.status} />
                      <span className="text-[10px] text-text-secondary flex-1 truncate">
                        <span className="text-text-secondary/50 mr-1">{i + 1}.</span>
                        {task.title}
                      </span>
                      {task.log && (
                        <svg
                          width="8" height="8" viewBox="0 0 20 20" fill="currentColor"
                          className={`flex-shrink-0 text-text-secondary/40 transition-transform ${expandedLogs.has(task.id) ? "rotate-180" : ""}`}
                        >
                          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      )}
                    </button>
                    {expandedLogs.has(task.id) && task.log && (
                      <div className="px-2 pb-2">
                        <pre className="text-[9px] text-text-secondary/70 leading-relaxed whitespace-pre-wrap font-mono bg-bg rounded p-1.5 max-h-24 overflow-y-auto">
                          {task.log}
                        </pre>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {loading && (
            <div className="flex justify-center py-2">
              <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
