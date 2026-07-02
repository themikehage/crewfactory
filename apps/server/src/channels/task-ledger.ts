import { existsSync, readFileSync, writeFileSync } from "node:fs";

export type TaskLedgerStatus = "open" | "in-progress" | "done" | "failed";

export interface LedgerTask {
  id: string;
  assignedBy: string;
  assignedByName: string;
  assignedTo: string;
  assignedToName: string;
  role: string;
  task: string;
  status: TaskLedgerStatus;
  createdAt: string;
  updatedAt: string;
}

export class TaskLedger {
  private tasks: LedgerTask[] = [];
  private path: string;

  constructor(ledgerPath: string) {
    this.path = ledgerPath;
    if (existsSync(ledgerPath)) {
      try {
        this.tasks = JSON.parse(readFileSync(ledgerPath, "utf-8")) as LedgerTask[];
      } catch {
        this.tasks = [];
      }
    }
  }

  record(entry: Omit<LedgerTask, "id" | "createdAt" | "updatedAt" | "status">): LedgerTask {
    const now = new Date().toISOString();
    const task: LedgerTask = {
      ...entry,
      id: crypto.randomUUID(),
      status: "open",
      createdAt: now,
      updatedAt: now,
    };
    this.tasks.push(task);
    this.persist();
    return task;
  }

  updateStatus(taskId: string, status: TaskLedgerStatus): void {
    const task = this.tasks.find((t) => t.id === taskId);
    if (task) {
      task.status = status;
      task.updatedAt = new Date().toISOString();
      this.persist();
    }
  }

  list(): LedgerTask[] {
    return this.tasks;
  }

  getOpenTasksFor(agentId: string): LedgerTask[] {
    return this.tasks.filter((t) => t.assignedTo === agentId && t.status === "open");
  }

  hasOpenTasks(): boolean {
    return this.tasks.some((t) => t.status === "open" || t.status === "in-progress");
  }

  reset(): void {
    this.tasks = [];
    this.persist();
  }

  private persist(): void {
    writeFileSync(this.path, JSON.stringify(this.tasks, null, 2), "utf-8");
  }
}
