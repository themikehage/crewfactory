import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sessionManager } from "./session-manager";
import { broadcastToSession } from "../ws/handler";

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
    execute: async (toolCallId: string, args: any) => {
      const taskId: string = args.taskId;
      const status: "done" | "failed" = args.status;
      const log: string = args.log || "";

      const userDir = sessionManager.ensureUserDir(username);
      const sessionDir = join(userDir, "sessions", parentSessionId);
      const tasksPath = join(sessionDir, "tasks.json");

      if (!existsSync(tasksPath)) {
        return {
          content: [{ type: "text", text: "Error: No active task plan found in this session. Create one first using decompose_tasks." }],
          isError: true,
        };
      }

      let state: any;
      try {
        state = JSON.parse(readFileSync(tasksPath, "utf-8"));
      } catch (err: any) {
        return {
          content: [{ type: "text", text: `Error reading task plan: ${err.message || String(err)}` }],
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

      // Update task status
      task.status = status;
      task.log = log;

      if (status === "failed") {
        state.status = "failed";
        state.error = `Task '${taskId}' failed: ${log}`;
      } else {
        // Resolve DAG dependencies to find the next ready task
        const completedTaskIds = new Set(
          state.tasks
            .filter((t: any) => t.status === "done")
            .map((t: any) => t.id)
        );

        const pendingTasks = state.tasks.filter((t: any) => t.status === "pending" || t.status === "running");

        // Find tasks whose dependencies are completely satisfied
        const readyTasks = pendingTasks.filter((t: any) => {
          const deps = t.depends_on || [];
          return deps.every((depId: string) => completedTaskIds.has(depId));
        });

        if (readyTasks.length > 0) {
          state.currentTaskId = readyTasks[0].id;
          readyTasks[0].status = "running";
        } else if (pendingTasks.length > 0) {
          // Fallback if there are pending tasks but none are ready (detect circular deps or block)
          state.currentTaskId = pendingTasks[0].id;
          pendingTasks[0].status = "running";
        } else {
          // No pending tasks left!
          state.currentTaskId = null;
          state.status = "running"; // wait for complete_task_list call
        }
      }

      try {
        writeFileSync(tasksPath, JSON.stringify(state, null, 2), "utf-8");
      } catch (e) {
        console.error("Failed to update tasks.json:", e);
      }

      broadcastToSession(parentSessionId, {
        type: "tasks_update",
        state,
      });

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
    execute: async (toolCallId: string, args: any) => {
      const summary: string = args.summary;

      const userDir = sessionManager.ensureUserDir(username);
      const sessionDir = join(userDir, "sessions", parentSessionId);
      const tasksPath = join(sessionDir, "tasks.json");

      if (!existsSync(tasksPath)) {
        return {
          content: [{ type: "text", text: "Error: No active task plan found to complete." }],
          isError: true,
        };
      }

      let state: any;
      try {
        state = JSON.parse(readFileSync(tasksPath, "utf-8"));
      } catch (err: any) {
        return {
          content: [{ type: "text", text: `Error reading task plan: ${err.message || String(err)}` }],
          isError: true,
        };
      }

      state.status = "completed";
      state.currentTaskId = null;
      state.error = undefined;

      try {
        writeFileSync(tasksPath, JSON.stringify(state, null, 2), "utf-8");
      } catch (e) {
        console.error("Failed to write tasks.json:", e);
      }

      broadcastToSession(parentSessionId, {
        type: "tasks_update",
        state,
      });

      return {
        content: [{ type: "text", text: `Task plan successfully completed! Summary: ${summary}` }],
        details: { status: "completed", summary, state },
      };
    },
  };

  return [updateTaskStatusTool, completeTaskListTool];
}
