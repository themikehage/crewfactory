import { useState } from "react";
import { motion } from "framer-motion";
import { TasksPanel } from "./TasksPanel";
import { InfrastructurePanel } from "./InfrastructurePanel";
import type { Task, TaskRunnerState } from "shared";
import { useLiterals } from "@/lib";
import { literals as u } from "./RightDrawer.literals";

interface Props {
  activeProjectName: string | null;
  tasksState: TaskRunnerState;
  onClose: () => void;
  onRun: () => Promise<void>;
  onPause: () => Promise<void>;
  onReset: () => Promise<void>;
  onDecompose: (objective: string) => Promise<void>;
  onUpdateTasks: (tasks: Task[]) => Promise<void>;
  onSendPrompt: (prompt: string) => void;
}

export function RightDrawer({
  activeProjectName,
  tasksState,
  onClose,
  onRun,
  onPause,
  onReset,
  onDecompose,
  onUpdateTasks,
  onSendPrompt,
}: Props) {
const l = useLiterals(u);
  const [activeTab, setActiveTab] = useState<"tasks" | "infra">("tasks");

  return (
    <motion.div
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={{ duration: 0.2, ease: "easeInOut" }}
      className="w-85 sm:w-96 flex flex-col h-full bg-card border-l border-input flex-shrink-0 relative z-10"
    >
      <div className="h-12 border-b border-input flex items-center justify-between px-3 flex-shrink-0 bg-background/50 backdrop-blur-xs">
        <div className="flex bg-background/60 p-0.5 rounded-lg border border-input/50 gap-0.5">
          <button
            onClick={() => setActiveTab("tasks")}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer ${
              activeTab === "tasks"
                ? "text-primary bg-card-hover"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Tasks
          </button>
          <button
            onClick={() => setActiveTab("infra")}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer ${
              activeTab === "infra"
                ? "text-primary bg-card-hover"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Infrastructure
          </button>
        </div>

        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground p-1 cursor-pointer transition-colors"
          title={l.closePanel}
        >
          <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-hidden min-h-0 flex flex-col">
        {activeTab === "tasks" ? (
          <TasksPanel
            tasksState={tasksState}
            onClose={onClose}
            onRun={onRun}
            onPause={onPause}
            onReset={onReset}
            onDecompose={onDecompose}
            onUpdateTasks={onUpdateTasks}
            isEmbedded={true}
          />
        ) : (
          <InfrastructurePanel
            activeProjectName={activeProjectName}
            onSendPrompt={onSendPrompt}
          />
        )}
      </div>
    </motion.div>
  );
}
