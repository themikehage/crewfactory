import { existsSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

export interface Task {
  id: string;
  title: string;
  prompt: string;
  status: "pending" | "running" | "done" | "failed";
  log: string;
  depends_on: string[];
  estimated_steps?: number;
}

export interface TaskState {
  objective: string;
  tasks: Task[];
  currentTaskId: string | null;
  status: "running" | "failed" | "completed";
  error?: string;
}

const rawTaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  prompt: z.string(),
  depends_on: z.array(z.string()).default([]),
  estimated_steps: z.number().optional(),
});

const cache = new Map<string, TaskState>();

function hasCycle(tasks: { id: string; depends_on: string[] }[]): boolean {
  const adj = new Map<string, string[]>();
  for (const t of tasks) {
    adj.set(t.id, t.depends_on || []);
  }
  const visited = new Set<string>();
  const recStack = new Set<string>();

  function dfs(node: string): boolean {
    if (recStack.has(node)) {
      return true;
    }
    if (visited.has(node)) {
      return false;
    }
    visited.add(node);
    recStack.add(node);
    const neighbors = adj.get(node) || [];
    for (const neighbor of neighbors) {
      if (dfs(neighbor)) {
        return true;
      }
    }
    recStack.delete(node);
    return false;
  }

  for (const t of tasks) {
    if (dfs(t.id)) {
      return true;
    }
  }
  return false;
}

export const TaskStateManager = {
  getTaskState(sessionDir: string): TaskState | null {
    if (cache.has(sessionDir)) {
      return cache.get(sessionDir) || null;
    }
    const tasksPath = join(sessionDir, "tasks.json");
    if (!existsSync(tasksPath)) {
      return null;
    }
    try {
      const content = readFileSync(tasksPath, "utf-8");
      const state = JSON.parse(content) as TaskState;
      cache.set(sessionDir, state);
      return state;
    } catch {
      return null;
    }
  },

  saveTaskState(sessionDir: string, state: TaskState): void {
    const tasksPath = join(sessionDir, "tasks.json");
    const tmpPath = tasksPath + ".tmp";
    const data = JSON.stringify(state);
    writeFileSync(tmpPath, data, "utf-8");
    renameSync(tmpPath, tasksPath);
    cache.set(sessionDir, state);
  },

  validateAndParseTasks(rawJson: unknown): Task[] | null {
    try {
      const parsed = z.array(rawTaskSchema).parse(rawJson);
      if (hasCycle(parsed)) {
        return null;
      }
      return parsed.map((t) => ({
        id: t.id,
        title: t.title,
        prompt: t.prompt,
        status: "pending" as const,
        log: "",
        depends_on: t.depends_on,
        estimated_steps: t.estimated_steps,
      }));
    } catch {
      return null;
    }
  },

  hasCircularDependency(tasks: { id: string; depends_on: string[] }[]): boolean {
    return hasCycle(tasks);
  },
};
