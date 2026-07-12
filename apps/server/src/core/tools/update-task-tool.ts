import { join } from "node:path";
import { sessionManager } from "../session-manager";
import { broadcastToSession } from "../../ws/handler";
import { TaskStateManager } from "./task-state-manager";

export interface UpdateTaskOptions {
  username: string;
  parentSessionId: string;
}

export function createUpdateTaskTools(opts: UpdateTaskOptions) {
  const { username, parentSessionId } = opts;

  const updateTaskStatusTool = {
    name: "update_task_status",
    description: `Update the status of a specific task in the active task plan.
Use this when you complete a task to mark it as 'done', or if it fails to mark it as 'failed'.
After marking a task as 'done', the task runner will automatically identify the next ready task based on the DAG dependencies and update your active task prompt instructions in the next turn.`,
    parameters: {
      type: "object",
      properties: {
        taskId: {
          type: "string",
          description: "The ID of the task to update (e.g., 't1').",
        },
        status: {
          type: "string",
          enum: ["done", "failed"],
          description: "The new status of the task.",
        },
        log: {
          type: "string",
          description: "Optional summary log explaining the outcome or findings of this task execution.",
        },
      },
      required: ["taskId", "status"],
    },
    execute: async (toolCallId: string, args: any, _parentSignal?: AbortSignal) => {
      const taskId: string = args.taskId;
      const status: "done" | "failed" = args.status;
      const log: string = args.log || "";

      const userDir = sessionManager.userConfig.ensureUserDir(username);
      const sessionDir = join(userDir, "sessions", parentSessionId);

      const state = TaskStateManager.getTaskState(sessionDir);
      if (!state) {
        return {
          content: [{ type: "text", text: "Error: No active task plan found in this session. Create one first using decompose_tasks." }],
          isError: true,
        };
      }

      const task = state.tasks?.find((t: any) => t.id === taskId);
      if (!task) {
        return {
          content: [{ type: "text", text: `Error: Task with ID '${taskId}' not found in the active plan.` }],
          isError: true,
        };
      }

      task.status = status;
      task.log = log;

      if (status === "failed") {
        state.status = "failed";
        state.error = `Task '${taskId}' failed: ${log}`;
      } else {
        const completedTaskIds = new Set(
          state.tasks
            .filter((t: any) => t.status === "done")
            .map((t: any) => t.id)
        );

        const pendingTasks = state.tasks.filter((t: any) => t.status === "pending" || t.status === "running");

        if (pendingTasks.length > 0) {
          const readyTasks = pendingTasks.filter((t: any) => {
            const deps = t.depends_on || [];
            return deps.every((depId: string) => completedTaskIds.has(depId));
          });

          if (readyTasks.length > 0) {
            state.currentTaskId = readyTasks[0].id;
            readyTasks[0].status = "running";
          } else {
            return {
              content: [{ type: "text", text: "Error: Deadlock or circular dependency detected in task plan dependencies." }],
              isError: true,
            };
          }
        } else {
          state.currentTaskId = null;
          state.status = "running";
        }
      }

      TaskStateManager.saveTaskState(sessionDir, state);

      try {
        broadcastToSession(parentSessionId, {
          type: "tasks_update",
          state,
        });
      } catch (e) {
        console.error("Failed to broadcast tasks_update:", e);
      }

      const nextTaskInfo = state.currentTaskId
        ? `Next active task is now: ${state.currentTaskId}.`
        : `All tasks complete! Call complete_task_list to finalize the plan.`;

      return {
        content: [{ type: "text", text: `Task '${taskId}' marked as '${status}'. ${nextTaskInfo}` }],
        details: { taskId, status, currentTaskId: state.currentTaskId, state },
      };
    },
  };

  const completeTaskListTool = {
    name: "complete_task_list",
    description: `Complete the active task plan.
Use this ONLY when all tasks in the list have been marked as 'done' and you have achieved the overall high-level objective.`,
    parameters: {
      type: "object",
      properties: {
        summary: {
          type: "string",
          description: "Final completion summary describing the final outcome, links to code files created, and deliverables.",
        },
      },
      required: ["summary"],
    },
    execute: async (toolCallId: string, args: any, _parentSignal?: AbortSignal) => {
      const summary: string = args.summary;

      const userDir = sessionManager.userConfig.ensureUserDir(username);
      const sessionDir = join(userDir, "sessions", parentSessionId);

      const state = TaskStateManager.getTaskState(sessionDir);
      if (!state) {
        return {
          content: [{ type: "text", text: "Error: No active task plan found to complete." }],
          isError: true,
        };
      }

      const incomplete = state.tasks.filter((t: any) => t.status !== "done" && t.status !== "failed");
      if (incomplete.length > 0) {
        return {
          content: [{ type: "text", text: `Error: Cannot complete. There are still incomplete tasks: ${incomplete.map((t: any) => t.id).join(", ")}` }],
          isError: true,
        };
      }

      state.status = "completed";
      state.currentTaskId = null;
      state.error = undefined;

      TaskStateManager.saveTaskState(sessionDir, state);

      try {
        broadcastToSession(parentSessionId, {
          type: "tasks_update",
          state,
        });
      } catch (e) {
        console.error("Failed to broadcast tasks_update:", e);
      }

      return {
        content: [{ type: "text", text: `Task plan successfully completed! Summary: ${summary}` }],
        details: { status: "completed", summary, state },
      };
    },
  };

  return [updateTaskStatusTool, completeTaskListTool];
}

