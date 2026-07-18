import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getTeamDir, TeamEventSchema, TeamExecutionSchema, type Team, type TeamEvent, type TeamEventType, type TeamExecution, type TeamExecutionStatus } from "shared";

function atomicWrite(path: string, value: unknown, json = true): void {
  const temporaryPath = `${path}.${crypto.randomUUID()}.tmp`;
  writeFileSync(temporaryPath, json ? JSON.stringify(value, null, 2) : String(value), "utf-8");
  renameSync(temporaryPath, path);
}

export class TeamExecutionStore {
  private runDir(username: string, teamId: string, executionId: string): string {
    const path = join(getTeamDir(username, teamId), "executions", executionId);
    if (!existsSync(path)) mkdirSync(path, { recursive: true });
    return path;
  }

  private executionPath(username: string, teamId: string, executionId: string): string { return join(this.runDir(username, teamId, executionId), "execution.json"); }
  private eventsPath(username: string, teamId: string, executionId: string): string { return join(this.runDir(username, teamId, executionId), "events.jsonl"); }

  create(username: string, team: Team, task: string, requestId: string): TeamExecution {
    const now = new Date().toISOString();
    const execution = TeamExecutionSchema.parse({ id: crypto.randomUUID(), requestId, teamId: team.id, task, topology: team.topology, members: team.members, configurationVersion: team.configurationVersion, status: "queued", steps: [], lastSequence: 0, createdAt: now, updatedAt: now });
    atomicWrite(this.executionPath(username, team.id, execution.id), execution);
    return execution;
  }

  get(username: string, teamId: string, executionId: string): TeamExecution | null {
    const path = this.executionPath(username, teamId, executionId);
    if (!existsSync(path)) return null;
    try { const parsed = TeamExecutionSchema.safeParse(JSON.parse(readFileSync(path, "utf-8"))); return parsed.success ? parsed.data : null; } catch { return null; }
  }

  findByRequestId(username: string, teamId: string, requestId: string): TeamExecution | null {
    const directory = join(getTeamDir(username, teamId), "executions");
    if (!existsSync(directory)) return null;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const execution = this.get(username, teamId, entry.name);
      if (execution?.requestId === requestId) return execution;
    }
    return null;
  }

  list(username: string, teamId: string): TeamExecution[] {
    const directory = join(getTeamDir(username, teamId), "executions");
    if (!existsSync(directory)) return [];
    return readdirSync(directory, { withFileTypes: true }).filter((entry) => entry.isDirectory()).flatMap((entry) => {
      const execution = this.get(username, teamId, entry.name);
      return execution ? [execution] : [];
    }).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  recoverInterrupted(username: string, teamId: string): number {
    let recovered = 0;
    for (const execution of this.list(username, teamId)) {
      if (!["queued", "planning", "working", "synthesizing"].includes(execution.status)) continue;
      this.appendEvent(username, teamId, execution.id, { type: "execution_interrupted", payload: { reason: "server_restart" } });
      recovered++;
    }
    return recovered;
  }

  update(username: string, teamId: string, executionId: string, update: (execution: TeamExecution) => TeamExecution): TeamExecution {
    const current = this.get(username, teamId, executionId);
    if (!current) throw new Error("Team execution not found");
    const next = TeamExecutionSchema.parse({ ...update(current), updatedAt: new Date().toISOString() });
    atomicWrite(this.executionPath(username, teamId, executionId), next);
    return next;
  }

  appendEvent(username: string, teamId: string, executionId: string, input: { id?: string; type: TeamEventType; stepId?: string; agentId?: string; payload?: Record<string, unknown> }): TeamEvent {
    const execution = this.get(username, teamId, executionId);
    if (!execution) throw new Error("Team execution not found");
    const events = this.events(username, teamId, executionId, 0, 10000);
    const id = input.id ?? crypto.randomUUID();
    const existing = events.find((event) => event.id === id);
    if (existing) return existing;
    const now = new Date().toISOString();
    const event = TeamEventSchema.parse({ ...input, id, teamId, executionId, sequence: execution.lastSequence + 1, payload: input.payload ?? {}, createdAt: now });
    atomicWrite(this.eventsPath(username, teamId, executionId), `${[...events, event].map((item) => JSON.stringify(item)).join("\n")}\n`, false);
    const statusByEvent: Partial<Record<TeamEventType, TeamExecutionStatus>> = { execution_started: "planning", execution_completed: "completed", execution_failed: "failed", execution_cancelled: "cancelled", execution_interrupted: "interrupted" };
    const phase = event.type === "phase_changed" && (event.payload.phase === "planning" || event.payload.phase === "working" || event.payload.phase === "synthesizing") ? event.payload.phase : undefined;
    const status = phase ?? statusByEvent[event.type] ?? execution.status;
    const terminal = ["completed", "failed", "cancelled", "interrupted"].includes(status);
    atomicWrite(this.executionPath(username, teamId, executionId), { ...execution, status, lastSequence: event.sequence, updatedAt: now, completedAt: terminal ? now : execution.completedAt, finalOutput: event.type === "execution_completed" && typeof event.payload.finalOutput === "string" ? event.payload.finalOutput : execution.finalOutput, terminalReason: terminal && typeof event.payload.reason === "string" ? event.payload.reason : execution.terminalReason });
    return event;
  }

  events(username: string, teamId: string, executionId: string, afterSequence = 0, limit = 200): TeamEvent[] {
    const path = this.eventsPath(username, teamId, executionId);
    if (!existsSync(path)) return [];
    try {
      return readFileSync(path, "utf-8").split("\n").filter(Boolean).flatMap((line) => {
        const parsed = TeamEventSchema.safeParse(JSON.parse(line));
        return parsed.success ? [parsed.data] : [];
      }).filter((event) => event.sequence > afterSequence).slice(0, limit);
    } catch { return []; }
  }
}

export const teamExecutionStore = new TeamExecutionStore();
