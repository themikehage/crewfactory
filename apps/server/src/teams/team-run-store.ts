import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import {
  TeamRunSchema,
  TeamTurnSchema,
  TeamEventSchema,
  CreateTeamRunSchema,
  type TeamRun,
  type TeamTurn,
  type TeamEvent,
  type TeamEventType,
  type TeamTurnStatus,
  type TeamRunStatus,
} from "shared";
import { getTeamRunDir, getTeamRunsDir } from "shared";

const MAX_RUNS_INDEX = 100;

type RunSummary = Pick<TeamRun, "id" | "teamId" | "sessionId" | "task" | "status" | "createdAt" | "updatedAt" | "completedAt" | "lastSequence">;

function atomicWrite(path: string, value: unknown, json = true): void {
  const temp = `${path}.${crypto.randomUUID()}.tmp`;
  writeFileSync(temp, json ? JSON.stringify(value, null, 2) : String(value), "utf-8");
  renameSync(temp, path);
}

class TeamRunStore {
  private ensureRunDir(username: string, teamId: string, runId: string): string {
    const dir = getTeamRunDir(username, teamId, runId);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    return dir;
  }

  private runJsonPath(username: string, teamId: string, runId: string): string {
    return join(getTeamRunDir(username, teamId, runId), "run.json");
  }

  private eventsPath(username: string, teamId: string, runId: string): string {
    return join(getTeamRunDir(username, teamId, runId), "events.jsonl");
  }

  private indexPath(username: string, teamId: string): string {
    return join(getTeamRunsDir(username, teamId), "_index.json");
  }

  private readIndex(username: string, teamId: string): RunSummary[] {
    const path = this.indexPath(username, teamId);
    if (!existsSync(path)) return [];
    try {
      const value = JSON.parse(readFileSync(path, "utf-8"));
      return Array.isArray(value.runs) ? value.runs : [];
    } catch {
      return [];
    }
  }

  private saveRun(run: TeamRun, username: string): void {
    const valid = TeamRunSchema.parse(run);
    this.ensureRunDir(username, valid.teamId, valid.id);
    atomicWrite(this.runJsonPath(username, valid.teamId, valid.id), valid);
    const summaries = this.readIndex(username, valid.teamId).filter((s) => s.id !== valid.id);
    const summary: RunSummary = {
      id: valid.id,
      teamId: valid.teamId,
      sessionId: valid.sessionId,
      task: valid.task,
      status: valid.status,
      createdAt: valid.createdAt,
      updatedAt: valid.updatedAt,
      completedAt: valid.completedAt,
      lastSequence: valid.lastSequence,
    };
    summaries.unshift(summary);
    const runsDir = getTeamRunsDir(username, valid.teamId);
    if (!existsSync(runsDir)) mkdirSync(runsDir, { recursive: true });
    atomicWrite(this.indexPath(username, valid.teamId), { runs: summaries.slice(0, MAX_RUNS_INDEX) });
  }

  createRun(username: string, teamId: string, input: unknown): TeamRun {
    const data = CreateTeamRunSchema.parse(input);
    const now = new Date().toISOString();
    const run: TeamRun = TeamRunSchema.parse({
      id: data.id ?? crypto.randomUUID(),
      teamId,
      sessionId: data.sessionId,
      task: data.task,
      status: "pending",
      turns: [],
      lastSequence: 0,
      createdAt: now,
      updatedAt: now,
    });
    this.saveRun(run, username);
    return run;
  }

  getRun(username: string, teamId: string, runId: string): TeamRun | null {
    const path = this.runJsonPath(username, teamId, runId);
    if (!existsSync(path)) return null;
    try {
      const parsed = TeamRunSchema.safeParse(JSON.parse(readFileSync(path, "utf-8")));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  listRuns(username: string, teamId: string, sessionId?: string, limit = 50): RunSummary[] {
    const all = this.readIndex(username, teamId).slice(0, Math.min(limit, MAX_RUNS_INDEX));
    return sessionId ? all.filter((r) => r.sessionId === sessionId) : all;
  }

  createTurn(username: string, teamId: string, runId: string, agentId: string): TeamTurn {
    const run = this.getRun(username, teamId, runId);
    if (!run) throw new Error("Team run not found");
    const index = run.turns.length;
    const now = new Date().toISOString();
    const turn = TeamTurnSchema.parse({
      id: crypto.randomUUID(),
      runId,
      agentId,
      index,
      status: "running",
      createdAt: now,
      startedAt: now,
      updatedAt: now,
    });
    run.turns.push(turn);
    run.updatedAt = now;
    this.saveRun(run, username);
    return turn;
  }

  updateTurn(username: string, teamId: string, runId: string, turnId: string, status: TeamTurnStatus, details: Partial<Pick<TeamTurn, "messageId" | "error" | "skipReason">> = {}): TeamTurn {
    const run = this.getRun(username, teamId, runId);
    if (!run) throw new Error("Team run not found");
    const idx = run.turns.findIndex((t) => t.id === turnId);
    if (idx < 0) throw new Error("Team turn not found");
    const now = new Date().toISOString();
    const current = run.turns[idx];
    const terminal = ["completed", "failed", "skipped"].includes(status);
    const turn = TeamTurnSchema.parse({
      ...current,
      ...details,
      status,
      completedAt: terminal ? now : current.completedAt,
      updatedAt: now,
    });
    run.turns[idx] = turn;
    run.updatedAt = now;
    this.saveRun(run, username);
    return turn;
  }

  finishOpenTurns(username: string, teamId: string, runId: string, status: "aborted" | "skipped"): void {
    const run = this.getRun(username, teamId, runId);
    if (!run) return;
    const now = new Date().toISOString();
    run.turns = run.turns.map((t) =>
      t.status === "running"
        ? TeamTurnSchema.parse({ ...t, status, skipReason: "aborted", completedAt: now, updatedAt: now })
        : t
    );
    run.updatedAt = now;
    this.saveRun(run, username);
  }

  appendEvent(
    username: string,
    teamId: string,
    runId: string,
    input: {
      id?: string;
      type: TeamEventType;
      agentId?: string;
      agentName?: string;
      toolCallId?: string;
      payload?: Record<string, unknown>;
    }
  ): TeamEvent {
    const run = this.getRun(username, teamId, runId);
    if (!run) throw new Error("Team run not found");

    const eventsFile = this.eventsPath(username, teamId, runId);
    const id = input.id ?? crypto.randomUUID();
    const now = new Date().toISOString();

    const event = TeamEventSchema.parse({
      id,
      runId,
      teamId,
      sessionId: run.sessionId,
      type: input.type,
      sequence: run.lastSequence + 1,
      agentId: input.agentId,
      agentName: input.agentName,
      toolCallId: input.toolCallId,
      payload: input.payload ?? {},
      createdAt: now,
    });

    appendFileSync(eventsFile, JSON.stringify(event) + "\n", "utf-8");

    run.lastSequence = event.sequence;
    run.updatedAt = now;

    if (event.type === "run_started") { run.status = "running"; run.startedAt = run.startedAt ?? now; }
    if (event.type === "run_completed") { run.status = "completed"; run.completedAt = now; }
    if (event.type === "run_aborted") { run.status = "aborted"; run.completedAt = now; }
    if (event.type === "run_failed") { run.status = "failed"; run.completedAt = now; run.terminalReason = String(input.payload?.error ?? ""); }
    if (event.type === "run_stalled") { run.status = "stalled"; run.completedAt = now; run.terminalReason = "server_restart"; }

    this.saveRun(run, username);
    return event;
  }

  getEvents(username: string, teamId: string, runId: string, afterSequence = 0, limit = 500): TeamEvent[] {
    const path = this.eventsPath(username, teamId, runId);
    if (!existsSync(path)) return [];
    try {
      return readFileSync(path, "utf-8")
        .split("\n")
        .filter(Boolean)
        .flatMap((line) => {
          const parsed = TeamEventSchema.safeParse(JSON.parse(line));
          return parsed.success ? [parsed.data] : [];
        })
        .filter((e) => e.sequence > afterSequence)
        .slice(0, Math.min(limit, 1000));
    } catch {
      return [];
    }
  }

  getActiveRun(username: string, teamId: string, sessionId: string): TeamRun | null {
    const runs = this.listRuns(username, teamId, sessionId, 5);
    const active = runs.find((r) => r.status === "pending" || r.status === "running");
    if (!active) return null;
    return this.getRun(username, teamId, active.id);
  }

  recoverInterruptedRuns(username: string, teamId: string): number {
    let recovered = 0;
    const index = this.readIndex(username, teamId);
    for (const summary of index) {
      if (summary.status !== "pending" && summary.status !== "running") continue;
      this.finishOpenTurns(username, teamId, summary.id, "aborted");
      this.appendEvent(username, teamId, summary.id, {
        type: "run_stalled",
        payload: { reason: "server_restart" },
      });
      recovered++;
    }
    return recovered;
  }
}

export const teamRunStore = new TeamRunStore();
