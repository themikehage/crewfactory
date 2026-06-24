import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { piSessionManager } from "./session-manager";
import { broadcastToSession, broadcastToUser } from "../ws/handler";
import type { Task, TaskRunnerState } from "shared";

const DECOMPOSITION_PROMPT_PREFIX = `You are a supervisor AI. I need to achieve the following high-level objective:`;
const DECOMPOSITION_PROMPT_SUFFIX = `
Please analyze the repository/workspace and decompose this objective into a series of detailed, sequential, actionable subtasks. Each subtask must be a logical step toward the final goal.

Your response MUST end with a valid JSON block containing an array of these subtasks, exactly matching this structure:
\`\`\`json
[
  {
    "title": "Task 1 Title",
    "prompt": "Detailed prompt instructions for this task, specifying what files to edit, what tools to run, etc."
  },
  {
    "title": "Task 2 Title",
    "prompt": "..."
  }
]
\`\`\`
Provide only the JSON block at the end. Do not include any other markdown other than the JSON block.`;

const activeRunners = new Set<string>(); // sessionId

export function isTaskRunnerActive(sessionId: string): boolean {
  return activeRunners.has(sessionId);
}

export function getTasksPath(username: string, sessionId: string): string {
  return `/tmp/pi-web-users/${username}/sessions/${sessionId}/tasks.json`;
}

export function loadTasksState(username: string, sessionId: string): TaskRunnerState {
  const path = getTasksPath(username, sessionId);
  if (!existsSync(path)) {
    return {
      tasks: [],
      currentTaskId: null,
      status: "idle",
    };
  }
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return {
      tasks: [],
      currentTaskId: null,
      status: "idle",
    };
  }
}

export function saveTasksState(username: string, sessionId: string, state: TaskRunnerState): void {
  const path = getTasksPath(username, sessionId);
  const dir = join(path, "..");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(path, JSON.stringify(state, null, 2), "utf-8");
}

export function broadcastTaskUpdate(sessionId: string, state: TaskRunnerState) {
  broadcastToSession(sessionId, { type: "tasks_update", state });
}

export async function decomposeObjective(username: string, sessionId: string, objective: string): Promise<void> {
  const state = loadTasksState(username, sessionId);
  state.status = "decomposing";
  state.tasks = [];
  state.currentTaskId = null;
  state.error = undefined;
  saveTasksState(username, sessionId, state);
  broadcastTaskUpdate(sessionId, state);
  broadcastToUser(username, { type: "session_status", sessionId, status: "task-running" });

  let session = piSessionManager.getSession(username, sessionId);
  if (!session) {
    session = await piSessionManager.getOrCreateSession(username, sessionId);
  }

  // Decompose asynchronously so REST endpoint returns quickly
  (async () => {
    try {
      const promptText = `${DECOMPOSITION_PROMPT_PREFIX} "${objective}" ${DECOMPOSITION_PROMPT_SUFFIX}`;
      await session!.prompt(promptText);

      const messages = session!.messages;
      const lastMsg = messages[messages.length - 1];
      let textContent = "";
      if (lastMsg && lastMsg.role === "assistant") {
        if (typeof lastMsg.content === "string") {
          textContent = lastMsg.content;
        } else if (Array.isArray(lastMsg.content)) {
          textContent = lastMsg.content
            .map((c) => ("text" in c ? c.text : ""))
            .join("\n");
        }
      }

      const jsonMatch = textContent.match(/```json\s*([\s\S]*?)\s*```/);
      let parsedTasks: Array<{ title: string; prompt: string }> = [];
      if (jsonMatch) {
        try {
          parsedTasks = JSON.parse(jsonMatch[1].trim());
        } catch {}
      } else {
        try {
          parsedTasks = JSON.parse(textContent.trim());
        } catch {}
      }

      if (Array.isArray(parsedTasks) && parsedTasks.length > 0) {
        const tasks: Task[] = parsedTasks.map((t, idx) => ({
          id: crypto.randomUUID(),
          title: t.title || `Step ${idx + 1}`,
          prompt: t.prompt || "",
          status: "pending",
          log: "",
        }));

        const successState: TaskRunnerState = {
          tasks,
          currentTaskId: null,
          status: "idle",
        };
        saveTasksState(username, sessionId, successState);
        broadcastTaskUpdate(sessionId, successState);
      } else {
        throw new Error("Could not parse a valid JSON array of tasks from supervisor response.");
      }
    } catch (err: any) {
      const failedState: TaskRunnerState = {
        tasks: [],
        currentTaskId: null,
        status: "failed",
        error: String(err),
      };
      saveTasksState(username, sessionId, failedState);
      broadcastTaskUpdate(sessionId, failedState);
    }
  })();
}

export async function startTaskRunner(username: string, sessionId: string): Promise<void> {
  const state = loadTasksState(username, sessionId);
  if (state.status === "running") {
    if (activeRunners.has(sessionId)) {
      return;
    }
  }

  state.status = "running";
  state.error = undefined;
  saveTasksState(username, sessionId, state);
  broadcastTaskUpdate(sessionId, state);
  broadcastToUser(username, { type: "session_status", sessionId, status: "task-running" });

  activeRunners.add(sessionId);

  (async () => {
    try {
      await runTaskLoop(username, sessionId);
    } finally {
      activeRunners.delete(sessionId);
    }
  })();
}

export async function pauseTaskRunner(username: string, sessionId: string): Promise<void> {
  const state = loadTasksState(username, sessionId);
  if (state.status !== "running") return;

  state.status = "paused";
  saveTasksState(username, sessionId, state);
  broadcastTaskUpdate(sessionId, state);
  broadcastToUser(username, { type: "session_status", sessionId, status: "active" });

  const session = piSessionManager.getSession(username, sessionId);
  if (session && session.isStreaming) {
    await session.abort();
  }
}

export function resetTasks(username: string, sessionId: string): void {
  const state = loadTasksState(username, sessionId);
  state.status = "idle";
  state.currentTaskId = null;
  state.error = undefined;
  state.tasks = state.tasks.map((t) => ({
    ...t,
    status: "pending",
    log: "",
  }));
  saveTasksState(username, sessionId, state);
  broadcastTaskUpdate(sessionId, state);
  broadcastToUser(username, { type: "session_status", sessionId, status: "active" });
}

async function runTaskLoop(username: string, sessionId: string): Promise<void> {
  let session = piSessionManager.getSession(username, sessionId);
  if (!session) {
    session = await piSessionManager.getOrCreateSession(username, sessionId);
  }

  while (true) {
    const state = loadTasksState(username, sessionId);
    if (state.status !== "running") {
      break;
    }

    const nextTask = state.tasks.find((t) => t.status === "pending" || t.status === "failed");
    if (!nextTask) {
      state.status = "completed";
      state.currentTaskId = null;
      saveTasksState(username, sessionId, state);
      broadcastTaskUpdate(sessionId, state);
      broadcastToUser(username, { type: "session_status", sessionId, status: "active" });
      break;
    }

    // Set next task to running
    nextTask.status = "running";
    state.currentTaskId = nextTask.id;
    saveTasksState(username, sessionId, state);
    broadcastTaskUpdate(sessionId, state);

    try {
      const sessionInstance = piSessionManager.getSession(username, sessionId)!;
      await sessionInstance.prompt(nextTask.prompt);

      // Check state again for potential pauses during prompt execution
      const currentState = loadTasksState(username, sessionId);
      const currentTask = currentState.tasks.find((t) => t.id === nextTask.id);

      if (currentState.status === "paused") {
        if (currentTask) {
          currentTask.status = "pending";
        }
        currentState.currentTaskId = null;
        saveTasksState(username, sessionId, currentState);
        broadcastTaskUpdate(sessionId, currentState);
        break;
      }

      if (currentTask) {
        currentTask.status = "done";

        // Save last assistant message to the log
        const messages = sessionInstance.messages;
        const lastMsg = messages[messages.length - 1];
        let logSummary = "";
        if (lastMsg && lastMsg.role === "assistant") {
          if (typeof lastMsg.content === "string") {
            logSummary = lastMsg.content;
          } else if (Array.isArray(lastMsg.content)) {
            logSummary = lastMsg.content
              .map((c) => ("text" in c ? c.text : "thinking" in c ? c.thinking : ""))
              .join("\n");
          }
        }
        currentTask.log = logSummary.slice(0, 10000);
      }

      saveTasksState(username, sessionId, currentState);
      broadcastTaskUpdate(sessionId, currentState);

    } catch (err: any) {
      const currentState = loadTasksState(username, sessionId);
      const currentTask = currentState.tasks.find((t) => t.id === nextTask.id);

      if (currentState.status === "paused") {
        if (currentTask) {
          currentTask.status = "pending";
        }
        currentState.currentTaskId = null;
        saveTasksState(username, sessionId, currentState);
        broadcastTaskUpdate(sessionId, currentState);
        break;
      } else {
        if (currentTask) {
          currentTask.status = "failed";
          currentTask.log = String(err);
        }
        currentState.status = "failed";
        currentState.currentTaskId = null;
        saveTasksState(username, sessionId, currentState);
        broadcastTaskUpdate(sessionId, currentState);
        broadcastToUser(username, { type: "session_status", sessionId, status: "active" });
        break;
      }
    }
  }
}
