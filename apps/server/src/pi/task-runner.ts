import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import type { AgentSession, AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import type { TaskRun, TaskItem, RunStatus } from "shared";

const DECOMPOSE_PROMPT = (objective: string) => `You are a project planning assistant. Decompose the following development objective into a sequential list of concrete implementation tasks.

Objective: ${objective}

Requirements:
- Between 3 and 10 tasks
- Each task must be self-contained and executable by a coding agent
- Tasks must be ordered by dependency (earlier tasks are prerequisites for later ones)
- Each task prompt must be specific enough that the agent can execute it without additional context
- Include the previous task's outcome as implicit context for each step

Respond ONLY with valid JSON, no markdown, no explanation:
{
  "tasks": [
    { "title": "Short title", "prompt": "Detailed prompt for the coding agent" }
  ]
}`;

const TASK_PROMPT = (task: TaskItem, index: number, total: number, contextLog: string) =>
  `[Task ${index + 1}/${total}: ${task.title}]

${task.prompt}${contextLog ? `\n\nContext from completed steps:\n${contextLog}` : ""}`;

export type WsSendFn = (event: Record<string, unknown>) => void;

interface ActiveRun {
  taskRun: TaskRun;
  workspaceDir: string;
  paused: boolean;
  pauseAfterCurrent: boolean;
}

function extractJson(text: string): { tasks: { title: string; prompt: string }[] } | null {
  const match = text.match(/\{[\s\S]*"tasks"[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

function extractTextFromContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((block: { type?: string; text?: string; thinking?: string }) => {
        if (block.type === "text" && block.text) return block.text;
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function buildContextLog(tasks: TaskItem[]): string {
  const done = tasks.filter((t) => t.status === "done" && t.log);
  if (done.length === 0) return "";
  return done
    .map((t, i) => `Step ${i + 1} (${t.title}): ${t.log.slice(0, 300)}`)
    .join("\n---\n");
}

class TaskRunnerEngine {
  private active = new Map<string, ActiveRun>();

  private key(username: string, sessionId: string): string {
    return `${username}:${sessionId}`;
  }

  private tasksFilePath(workspaceDir: string): string {
    return join(workspaceDir, "tasks.json");
  }

  saveToDisk(run: TaskRun, workspaceDir: string): void {
    if (!existsSync(workspaceDir)) mkdirSync(workspaceDir, { recursive: true });
    const path = this.tasksFilePath(workspaceDir);
    run.updatedAt = new Date().toISOString();
    writeFileSync(path, JSON.stringify(run, null, 2), "utf-8");
  }

  loadFromDisk(workspaceDir: string): TaskRun | null {
    const path = this.tasksFilePath(workspaceDir);
    if (!existsSync(path)) return null;
    try {
      return JSON.parse(readFileSync(path, "utf-8")) as TaskRun;
    } catch {
      return null;
    }
  }

  archiveCurrent(workspaceDir: string): void {
    const path = this.tasksFilePath(workspaceDir);
    if (existsSync(path)) {
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      renameSync(path, join(workspaceDir, `tasks-${ts}.json`));
    }
  }

  getStatus(username: string, sessionId: string): TaskRun | null {
    const run = this.active.get(this.key(username, sessionId));
    return run?.taskRun ?? null;
  }

  pause(username: string, sessionId: string): boolean {
    const run = this.active.get(this.key(username, sessionId));
    if (!run || run.taskRun.status !== "running") return false;
    run.pauseAfterCurrent = true;
    return true;
  }

  async resume(
    username: string,
    sessionId: string,
    session: AgentSession,
    wsSend: WsSendFn
  ): Promise<boolean> {
    const run = this.active.get(this.key(username, sessionId));
    if (!run || run.taskRun.status !== "paused") return false;
    run.taskRun.status = "running";
    run.paused = false;
    run.pauseAfterCurrent = false;
    this.saveToDisk(run.taskRun, run.workspaceDir);
    this.runLoop(username, sessionId, run, session, wsSend).catch(console.error);
    return true;
  }

  cancel(username: string, sessionId: string): boolean {
    const key = this.key(username, sessionId);
    const run = this.active.get(key);
    if (!run) return false;
    run.paused = true;
    run.taskRun.status = "failed";
    this.saveToDisk(run.taskRun, run.workspaceDir);
    this.active.delete(key);
    return true;
  }

  async start(
    username: string,
    sessionId: string,
    workspaceDir: string,
    session: AgentSession,
    input: { objective: string; tasks?: { title: string; prompt: string }[] },
    wsSend: WsSendFn
  ): Promise<TaskRun> {
    const key = this.key(username, sessionId);

    const existing = this.active.get(key);
    if (existing) {
      existing.paused = true;
    }

    this.archiveCurrent(workspaceDir);

    let taskList: { title: string; prompt: string }[];

    if (input.tasks && input.tasks.length > 0) {
      taskList = input.tasks;
    } else {
      wsSend({ type: "task_decomposing", sessionId });
      taskList = await this.decomposeObjective(input.objective, session, sessionId, wsSend);
    }

    const now = new Date().toISOString();
    const taskRun: TaskRun = {
      id: crypto.randomUUID(),
      sessionId,
      objective: input.objective,
      createdAt: now,
      updatedAt: now,
      status: "running",
      currentTaskIndex: 0,
      tasks: taskList.map((t, i) => ({
        id: `task-${i + 1}`,
        title: t.title,
        prompt: t.prompt,
        status: "pending",
        startedAt: null,
        completedAt: null,
        log: "",
        retries: 0,
      })),
    };

    const run: ActiveRun = {
      taskRun,
      workspaceDir,
      paused: false,
      pauseAfterCurrent: false,
    };

    this.active.set(key, run);
    this.saveToDisk(taskRun, workspaceDir);

    wsSend({
      type: "task_run_start",
      sessionId,
      totalTasks: taskRun.tasks.length,
      objective: taskRun.objective,
      tasks: taskRun.tasks.map((t) => ({ id: t.id, title: t.title, status: t.status })),
    });

    this.runLoop(username, sessionId, run, session, wsSend).catch(console.error);

    return taskRun;
  }

  private async decomposeObjective(
    objective: string,
    session: AgentSession,
    sessionId: string,
    wsSend: WsSendFn
  ): Promise<{ title: string; prompt: string }[]> {
    let lastContent = "";

    const unsub = session.subscribe((event: AgentSessionEvent) => {
      const evt = event as Record<string, unknown>;
      if (evt.type === "message_end") {
        const msg = evt.message as { role?: string; content?: unknown } | undefined;
        if (msg?.role === "assistant") {
          lastContent = extractTextFromContent(msg.content);
        }
      }
    });

    try {
      await session.prompt(DECOMPOSE_PROMPT(objective));
    } finally {
      unsub();
    }

    const parsed = extractJson(lastContent);
    if (parsed?.tasks?.length) {
      return parsed.tasks;
    }

    wsSend({ type: "task_decompose_fallback", sessionId });
    return [{ title: objective, prompt: objective }];
  }

  private async runLoop(
    username: string,
    sessionId: string,
    run: ActiveRun,
    session: AgentSession,
    wsSend: WsSendFn
  ): Promise<void> {
    const { taskRun } = run;

    const pendingIndexes = taskRun.tasks
      .map((t, i) => i)
      .filter((i) => taskRun.tasks[i].status === "pending" || taskRun.tasks[i].status === "running");

    for (const taskIndex of pendingIndexes) {
      if (run.paused || run.pauseAfterCurrent) {
        if (run.pauseAfterCurrent) {
          run.pauseAfterCurrent = false;
          run.paused = true;
        }
        taskRun.status = "paused";
        taskRun.currentTaskIndex = taskIndex;
        this.saveToDisk(taskRun, run.workspaceDir);
        wsSend({ type: "task_run_paused", sessionId, taskIndex });
        return;
      }

      const task = taskRun.tasks[taskIndex];
      task.status = "running";
      task.startedAt = new Date().toISOString();
      taskRun.currentTaskIndex = taskIndex;
      this.saveToDisk(taskRun, run.workspaceDir);

      wsSend({
        type: "task_step_start",
        sessionId,
        taskIndex,
        title: task.title,
        totalTasks: taskRun.tasks.length,
      });

      const success = await this.executeTask(task, taskIndex, taskRun.tasks, session, sessionId, wsSend, run);

      if (!success) {
        taskRun.status = "failed";
        this.saveToDisk(taskRun, run.workspaceDir);
        wsSend({ type: "task_run_failed", sessionId, taskIndex, error: `Task "${task.title}" failed after retry` });
        return;
      }

      task.status = "done";
      task.completedAt = new Date().toISOString();
      this.saveToDisk(taskRun, run.workspaceDir);

      wsSend({
        type: "task_step_done",
        sessionId,
        taskIndex,
        title: task.title,
        log: task.log,
      });
    }

    taskRun.status = "done";
    this.saveToDisk(taskRun, run.workspaceDir);
    wsSend({ type: "task_run_done", sessionId, totalTasks: taskRun.tasks.length });
    this.active.delete(this.key(username, sessionId));
  }

  private async executeTask(
    task: TaskItem,
    taskIndex: number,
    allTasks: TaskItem[],
    session: AgentSession,
    sessionId: string,
    wsSend: WsSendFn,
    run: ActiveRun
  ): Promise<boolean> {
    const contextLog = buildContextLog(allTasks.slice(0, taskIndex));
    const builtPrompt = TASK_PROMPT(task, taskIndex, allTasks.length, contextLog);

    for (let attempt = 0; attempt <= 1; attempt++) {
      if (attempt > 0) {
        task.retries = attempt;
        wsSend({ type: "task_step_retrying", sessionId, taskIndex, attempt });
      }

      let lastContent = "";

      const unsub = session.subscribe((event: AgentSessionEvent) => {
        const evt = event as Record<string, unknown>;
        if (evt.type === "message_end") {
          const msg = evt.message as { role?: string; content?: unknown } | undefined;
          if (msg?.role === "assistant") {
            lastContent = extractTextFromContent(msg.content);
          }
        }
      });

      try {
        const promptText = attempt === 0
          ? builtPrompt
          : `${builtPrompt}\n\nNote: First attempt failed. Please try a different approach.`;

        await session.prompt(promptText);
        task.log = lastContent.slice(-600);
        return true;
      } catch (err) {
        console.error(`Task ${taskIndex} attempt ${attempt} failed:`, err);
        if (attempt === 0) continue;
        task.log = `Failed: ${String(err)}`;
        return false;
      } finally {
        unsub();
        if (run.paused) return false;
      }
    }

    return false;
  }
}

export const taskRunner = new TaskRunnerEngine();
