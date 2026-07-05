import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import type { Task, TaskRunnerState } from "shared";
import { useLiterals } from "@/lib";
import { literals as u } from "./TasksPanel.literals";

interface Props {
  tasksState: TaskRunnerState;
  onClose: () => void;
  onRun: () => Promise<void>;
  onPause: () => Promise<void>;
  onReset: () => Promise<void>;
  onDecompose: (objective: string) => Promise<void>;
  onUpdateTasks: (tasks: Task[]) => Promise<void>;
  isEmbedded?: boolean;
}

export function TasksPanel({
  tasksState,
  onClose,
  onRun,
  onPause,
  onReset,
  onDecompose,
  onUpdateTasks,
  isEmbedded = false,
}: Props) {
const l = useLiterals(u);
  const { tasks, currentTaskId, status, error } = tasksState;

  const [objective, setObjective] = useState("");
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<{ id: string; title: string; prompt: string } | null>(null);
  const [newStep, setNewStep] = useState<{ title: string; prompt: string } | null>(null);

  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (currentTaskId) {
      setExpandedTaskId(currentTaskId);
    }
  }, [currentTaskId]);

  const handleDecompose = async () => {
    if (!objective.trim()) return;
    await onDecompose(objective);
    setObjective("");
  };

  const handleToggleExpand = (id: string) => {
    setExpandedTaskId(expandedTaskId === id ? null : id);
  };

  const handleDeleteTask = async (id: string) => {
    const updated = tasks.filter((t) => t.id !== id);
    await onUpdateTasks(updated);
  };

  const handleStartEditing = (task: Task) => {
    setEditingTask({ id: task.id, title: task.title, prompt: task.prompt });
  };

  const handleSaveEdit = async () => {
    if (!editingTask) return;
    const updated = tasks.map((t) =>
      t.id === editingTask.id
        ? { ...t, title: editingTask.title, prompt: editingTask.prompt }
        : t
    );
    await onUpdateTasks(updated);
    setEditingTask(null);
  };

  const handleAddTask = async () => {
    if (!newStep || !newStep.title.trim()) return;
    const task: Task = {
      id: crypto.randomUUID(),
      title: newStep.title,
      prompt: newStep.prompt,
      status: "pending",
      log: "",
    };
    await onUpdateTasks([...tasks, task]);
    setNewStep(null);
  };

  const handleMoveStep = async (index: number, direction: "up" | "down") => {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= tasks.length) return;

    const copy = [...tasks];
    const temp = copy[index];
    copy[index] = copy[targetIndex];
    copy[targetIndex] = temp;

    await onUpdateTasks(copy);
  };

  const getStatusBadge = (task: Task) => {
    switch (task.status) {
      case "running":
        return (
          <span className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded border border-success/30 text-primary bg-primary/5 font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            Running
          </span>
        );
      case "done":
        return (
          <span className="flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded border border-success/20 text-primary/80 bg-primary/5 font-semibold">
            <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            Done
          </span>
        );
      case "failed":
        return (
          <span className="flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded border border-error/30 text-destructive bg-destructive/5 font-semibold">
            <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l3.293-3.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
            Failed
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded border border-input text-muted-foreground bg-card/5 font-semibold">
            Pending
          </span>
        );
    }
  };

  const getOverallStatusText = () => {
    switch (status) {
      case "decomposing":
        return l.decomposing;
      case "running":
        const activeIdx = tasks.findIndex((t) => t.id === currentTaskId) + 1;
        return `Running step ${activeIdx} of ${tasks.length}`;
      case "paused":
        return l.paused;
      case "completed":
        return l.completed;
      case "failed":
        return l.failed;
      default:
        return `${tasks.length} steps configured`;
    }
  };

  const renderContent = () => (
    <>
      {tasks.length > 0 && status !== "decomposing" && (
        <div className="p-3 border-b border-input flex items-center justify-between bg-background/20 flex-shrink-0">
          <div className="text-[11px] text-muted-foreground font-medium">
            {getOverallStatusText()}
          </div>
          <div className="flex gap-2">
            {status === "running" ? (
              <button
                onClick={onPause}
                className="flex items-center gap-1 text-xs px-2.5 py-1 rounded bg-warning text-background hover:opacity-95 transition-opacity font-semibold cursor-pointer"
                title={l.pause}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                </svg>
                Pause
              </button>
            ) : (
              <button
                onClick={onRun}
                disabled={status === "completed"}
                className="flex items-center gap-1 text-xs px-2.5 py-1 rounded bg-primary text-background hover:opacity-95 disabled:opacity-50 transition-opacity font-semibold cursor-pointer"
                title={l.startResume}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z"/>
                </svg>
                Run
              </button>
            )}
            <button
              onClick={onReset}
              className="flex items-center gap-1 text-xs px-2.5 py-1 rounded border border-input text-muted-foreground hover:text-foreground hover:bg-background/40 transition-colors font-medium cursor-pointer"
              title={l.reset}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
              </svg>
              Reset
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 min-h-0">
        {error && (
          <div className="mb-4 p-3 bg-destructive/10 border border-error/20 rounded-lg text-destructive text-xs flex flex-col gap-1">
            <span className="font-semibold flex items-center gap-1">
              <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              Runner Error
            </span>
            <span className="font-mono break-words">{error}</span>
          </div>
        )}

        {status === "decomposing" ? (
          <div className="space-y-4">
            <div className="text-center py-4 text-xs text-muted-foreground font-medium animate-pulse">
              Analyzing repository files and generating subtasks...
            </div>
            {[1, 2, 3].map((n) => (
              <div key={n} className="p-4 bg-background/40 border border-input/30 rounded-lg space-y-2 animate-pulse">
                <div className="h-4 bg-card-hover rounded w-1/3" />
                <div className="h-3 bg-card-hover rounded w-5/6" />
                <div className="h-3 bg-card-hover rounded w-2/3" />
              </div>
            ))}
          </div>
        ) : tasks.length === 0 ? (
          <div className="space-y-4">
            <div className="text-center py-6 text-xs text-muted-foreground leading-relaxed">
              No active steps in this session queue. Generate a structured step plan using AI decomposition, or add steps manually.
            </div>
            <div className="space-y-2">
              <label className="text-xs uppercase font-semibold text-muted-foreground tracking-wider">
                Decompose Objective with AI
              </label>
              <textarea
                value={objective}
                onChange={(e) => setObjective(e.target.value)}
                placeholder="e.g. Build a standard responsive React login screen connected to auth hooks, adding tests and README documentation..."
                className="w-full h-32 px-3 py-2 bg-background border border-input rounded-lg text-xs font-sans text-foreground placeholder-text-secondary outline-none focus:border-primary resize-none transition-colors"
              />
              <button
                onClick={handleDecompose}
                disabled={!objective.trim()}
                className="w-full py-2 rounded bg-primary text-background hover:opacity-95 disabled:opacity-50 transition-opacity font-semibold text-xs cursor-pointer flex items-center justify-center gap-1.5"
              >
                <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
                </svg>
                AI Decompose
              </button>
            </div>

            <div className="relative flex items-center justify-center py-2">
              <span className="absolute inset-0 flex items-center" aria-hidden="true">
                <span className="w-full border-t border-input/50" />
              </span>
              <span className="relative bg-card px-2 text-xs uppercase font-bold text-muted-foreground">
                Or
              </span>
            </div>

            <button
              onClick={() => setNewStep({ title: l.newStepTitle, prompt: l.newStepPrompt })}
              className="w-full py-2 border border-input hover:border-primary hover:text-primary bg-background/25 text-muted-foreground font-semibold rounded text-xs cursor-pointer transition-colors flex items-center justify-center gap-1"
            >
              + Create Step Manually
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {tasks.map((task, index) => {
              const isExpanded = expandedTaskId === task.id;
              const isEditing = editingTask?.id === task.id;

              return (
                <div
                  key={task.id}
                  className={`bg-background/25 border rounded-lg overflow-hidden transition-all ${
                    task.status === "running"
                      ? "border-success bg-primary/2"
                      : isExpanded
                      ? "border-input bg-background/40"
                      : "border-input"
                  }`}
                >
                  <div
                    onClick={() => handleToggleExpand(task.id)}
                    className="p-3 flex items-center justify-between cursor-pointer select-none hover:bg-background/15 transition-colors gap-3"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="text-xs font-mono font-bold text-muted-foreground flex-shrink-0">
                        {(index + 1).toString().padStart(2, "0")}
                      </span>
                      <span className={`text-xs font-semibold truncate ${
                        task.status === "done" ? "text-muted-foreground line-through" : "text-foreground"
                      }`}>
                        {task.title}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {getStatusBadge(task)}
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        className={`text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`}
                      >
                        <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="p-3 border-t border-input bg-card/10 space-y-3">
                      {isEditing ? (
                        <div className="space-y-2">
                          <input
                            type="text"
                            value={editingTask.title}
                            onChange={(e) => setEditingTask({ ...editingTask, title: e.target.value })}
                            className="w-full px-2 py-1.5 bg-background border border-input rounded text-xs text-foreground font-sans focus:border-primary outline-none"
                            placeholder={l.stepTitlePlaceholder}
                          />
                          <textarea
                            value={editingTask.prompt}
                            onChange={(e) => setEditingTask({ ...editingTask, prompt: e.target.value })}
                            className="w-full h-24 px-2 py-1.5 bg-background border border-input rounded text-xs text-foreground font-mono focus:border-primary outline-none resize-none"
                            placeholder={l.stepPromptPlaceholder}
                          />
                          <div className="flex justify-end gap-2 text-xs">
                            <button
                              onClick={() => setEditingTask(null)}
                              className="px-2 py-1 bg-card-hover text-foreground font-medium rounded cursor-pointer transition-colors"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={handleSaveEdit}
                              className="px-2.5 py-1 bg-primary text-background font-semibold rounded cursor-pointer transition-colors"
                            >
                              Save Step
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className="space-y-1">
                            <div className="text-xs uppercase font-bold text-muted-foreground tracking-wider">
                              Prompt Instructions
                            </div>
                            <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed bg-background/30 p-2 border border-input/30 rounded">
                              {task.prompt}
                            </p>
                          </div>

                          {task.log && (
                            <div className="space-y-1">
                              <div className="text-xs uppercase font-bold text-muted-foreground tracking-wider">
                                Step Execution Output
                              </div>
                              <div className="max-h-48 overflow-y-auto p-2 bg-background border border-input text-xs font-mono text-muted-foreground/90 rounded select-text whitespace-pre-wrap leading-normal scrollbar-thin">
                                {task.log}
                                <div ref={logsEndRef} />
                              </div>
                            </div>
                          )}

                          {status !== "running" && (
                            <div className="flex justify-between items-center pt-1 text-xs text-muted-foreground border-t border-input/40">
                              <div className="flex gap-1.5">
                                <button
                                  onClick={() => handleMoveStep(index, "up")}
                                  disabled={index === 0}
                                  className="p-1 hover:text-foreground hover:bg-card-hover rounded cursor-pointer disabled:opacity-30 disabled:pointer-events-none transition-colors"
                                  title="Move Up"
                                >
                                  <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clipRule="evenodd" />
                                  </svg>
                                </button>
                                <button
                                  onClick={() => handleMoveStep(index, "down")}
                                  disabled={index === tasks.length - 1}
                                  className="p-1 hover:text-foreground hover:bg-card-hover rounded cursor-pointer disabled:opacity-30 disabled:pointer-events-none transition-colors"
                                  title="Move Down"
                                >
                                  <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                                  </svg>
                                </button>
                              </div>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleStartEditing(task)}
                                  className="flex items-center gap-0.5 text-primary hover:underline cursor-pointer font-semibold"
                                >
                                  <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor">
                                    <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                                  </svg>
                                  Edit
                                </button>
                                <button
                                  onClick={() => handleDeleteTask(task.id)}
                                  className="flex items-center gap-0.5 text-destructive hover:underline cursor-pointer font-semibold"
                                >
                                  <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                                  </svg>
                                  Delete
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {newStep ? (
              <div className="p-3 bg-background/40 border border-input rounded-lg space-y-2">
                <input
                  type="text"
                  value={newStep.title}
                  onChange={(e) => setNewStep({ ...newStep, title: e.target.value })}
                  placeholder="New step title..."
                  className="w-full px-2.5 py-1.5 bg-background border border-input rounded text-xs text-foreground focus:border-primary outline-none"
                />
                <textarea
                  value={newStep.prompt}
                  onChange={(e) => setNewStep({ ...newStep, prompt: e.target.value })}
                  placeholder="Describe step tasks in detail..."
                  className="w-full h-20 px-2.5 py-1.5 bg-background border border-input rounded text-xs text-foreground font-mono focus:border-primary outline-none resize-none"
                />
                <div className="flex justify-end gap-2 text-xs">
                  <button
                    onClick={() => setNewStep(null)}
                    className="px-2 py-1 bg-card-hover text-foreground font-medium rounded cursor-pointer transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAddTask}
                    disabled={!newStep.title.trim()}
                    className="px-2.5 py-1 bg-primary text-background font-semibold rounded disabled:opacity-50 cursor-pointer transition-colors"
                  >
                    Add
                  </button>
                </div>
              </div>
            ) : (
              status !== "running" && (
                <button
                  onClick={() => setNewStep({ title: "", prompt: "" })}
                  className="w-full py-2 border border-dashed border-input hover:border-primary hover:text-primary bg-background/10 text-muted-foreground rounded text-xs cursor-pointer transition-colors flex items-center justify-center gap-1 font-medium"
                >
                  + Add Queue Step
                </button>
              )
            )}
          </div>
        )}
      </div>
    </>
  );

  if (isEmbedded) {
    return (
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {renderContent()}
      </div>
    );
  }

  return (
    <motion.div
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={{ duration: 0.2, ease: "easeInOut" }}
      className="w-85 sm:w-96 flex flex-col h-full bg-card border-l border-input flex-shrink-0 relative z-10"
    >
      <div className="h-10 sm:h-12 border-b border-input flex items-center justify-between px-4 flex-shrink-0 bg-background/50 backdrop-blur-xs">
        <div className="flex items-center gap-2">
          <span className="font-display font-bold text-sm text-foreground">
            Task Queue
          </span>
          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
        </div>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground p-1 cursor-pointer transition-colors"
          title="Close tasks panel"
        >
          <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
      </div>
      {renderContent()}
    </motion.div>
  );
}
