import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ChannelExecutionEventSchema, ChannelExecutionSchema, ChannelTurnSchema, CreateChannelExecutionSchema, type ChannelExecution, type ChannelExecutionEvent, type ChannelExecutionEventType, type ChannelExecutionStatus, type ChannelTurn, type ChannelTurnStatus, getChannelsDir } from "shared";

const MAX_EXECUTIONS = 200;
type Summary = Pick<ChannelExecution, "id" | "channelId" | "sessionId" | "schedulerMode" | "status" | "createdAt" | "updatedAt" | "completedAt" | "lastSequence">;

function atomicWrite(path: string, value: unknown, json = true): void {
  const temp = `${path}.${crypto.randomUUID()}.tmp`;
  writeFileSync(temp, json ? JSON.stringify(value, null, 2) : String(value), "utf-8");
  renameSync(temp, path);
}

export class ChannelExecutionStore {
  private runsDir(username: string, channelId: string): string {
    const path = join(getChannelsDir(username), channelId, "executions", "runs");
    if (!existsSync(path)) mkdirSync(path, { recursive: true });
    return path;
  }
  private runDir(username: string, channelId: string, executionId: string): string {
    const path = join(this.runsDir(username, channelId), executionId);
    if (!existsSync(path)) mkdirSync(path, { recursive: true });
    return path;
  }
  private executionPath(username: string, channelId: string, executionId: string): string { return join(this.runDir(username, channelId, executionId), "execution.json"); }
  private eventsPath(username: string, channelId: string, executionId: string): string { return join(this.runDir(username, channelId, executionId), "events.jsonl"); }
  private indexPath(username: string, channelId: string): string { return join(getChannelsDir(username), channelId, "executions", "_index.json"); }
  private readIndex(username: string, channelId: string): Summary[] {
    const path = this.indexPath(username, channelId);
    if (!existsSync(path)) return [];
    try { const value = JSON.parse(readFileSync(path, "utf-8")); return Array.isArray(value.executions) ? value.executions : []; } catch { return []; }
  }
  private save(execution: ChannelExecution, username: string): void {
    const valid = ChannelExecutionSchema.parse(execution);
    atomicWrite(this.executionPath(username, valid.channelId, valid.id), valid);
    const summaries = this.readIndex(username, valid.channelId).filter((item) => item.id !== valid.id);
    summaries.unshift({ id: valid.id, channelId: valid.channelId, sessionId: valid.sessionId, schedulerMode: valid.schedulerMode, status: valid.status, createdAt: valid.createdAt, updatedAt: valid.updatedAt, completedAt: valid.completedAt, lastSequence: valid.lastSequence });
    atomicWrite(this.indexPath(username, valid.channelId), { executions: summaries.slice(0, MAX_EXECUTIONS) });
  }
  createExecution(username: string, channelId: string, input: unknown = {}): ChannelExecution {
    const data = CreateChannelExecutionSchema.parse(input); const now = new Date().toISOString();
    const execution: ChannelExecution = { id: data.id ?? crypto.randomUUID(), channelId, sessionId: data.sessionId, schedulerMode: data.schedulerMode, topologyVersion: data.topologyVersion, policyVersion: data.policyVersion, promptPolicyChecksum: data.promptPolicyChecksum, status: "pending", turns: [], lastSequence: 0, createdAt: now, updatedAt: now };
    this.save(execution, username); return execution;
  }
  getExecution(username: string, channelId: string, executionId: string): ChannelExecution | null {
    const path = this.executionPath(username, channelId, executionId);
    if (!existsSync(path)) return null;
    try { const parsed = ChannelExecutionSchema.safeParse(JSON.parse(readFileSync(path, "utf-8"))); return parsed.success ? parsed.data : null; } catch { return null; }
  }
  listExecutions(username: string, channelId: string, limit = 50): Summary[] { return this.readIndex(username, channelId).slice(0, Math.max(1, Math.min(limit, MAX_EXECUTIONS))); }
  createTurn(username: string, channelId: string, executionId: string, agentId: string, index: number): ChannelTurn {
    const execution = this.getExecution(username, channelId, executionId); if (!execution) throw new Error("Channel execution not found");
    if (execution.turns.some((turn) => turn.index === index)) throw new Error(`Channel turn index ${index} already exists`);
    const now = new Date().toISOString();
    const turn = ChannelTurnSchema.parse({ id: crypto.randomUUID(), executionId, index, agentId, status: "running", createdAt: now, startedAt: now, updatedAt: now });
    execution.turns.push(turn); execution.updatedAt = now; this.save(execution, username); return turn;
  }
  updateTurn(username: string, channelId: string, executionId: string, turnId: string, status: ChannelTurnStatus, details: Partial<Pick<ChannelTurn, "skipReason" | "messageId" | "error">> = {}): ChannelTurn {
    const execution = this.getExecution(username, channelId, executionId); if (!execution) throw new Error("Channel execution not found");
    const index = execution.turns.findIndex((turn) => turn.id === turnId); if (index < 0) throw new Error("Channel turn not found");
    const now = new Date().toISOString(); const current = execution.turns[index];
    const turn = ChannelTurnSchema.parse({ ...current, ...details, status, completedAt: ["completed", "skipped", "failed", "aborted"].includes(status) ? now : current.completedAt, updatedAt: now });
    execution.turns[index] = turn; execution.updatedAt = now; this.save(execution, username); return turn;
  }
  finishOpenTurns(username: string, channelId: string, executionId: string, status: "aborted" | "skipped", skipReason: "aborted" | "chain_limit"): void {
    const execution = this.getExecution(username, channelId, executionId); if (!execution) return;
    const now = new Date().toISOString();
    execution.turns = execution.turns.map((turn) => turn.status === "running" || turn.status === "pending"
      ? ChannelTurnSchema.parse({ ...turn, status, skipReason, completedAt: now, updatedAt: now })
      : turn);
    execution.updatedAt = now; this.save(execution, username);
  }
  recoverInterruptedExecutions(username: string, channelId: string): number {
    let recovered = 0;
    for (const summary of this.listExecutions(username, channelId, MAX_EXECUTIONS)) {
      if (summary.status !== "pending" && summary.status !== "running") continue;
      this.finishOpenTurns(username, channelId, summary.id, "aborted", "aborted");
      this.appendEvent(username, channelId, summary.id, { type: "execution_stalled", sessionId: summary.sessionId, payload: { reason: "server_restart" } });
      recovered++;
    }
    return recovered;
  }
  private readEvents(username: string, channelId: string, executionId: string): ChannelExecutionEvent[] {
    const path = this.eventsPath(username, channelId, executionId);
    if (!existsSync(path)) return [];
    try { return readFileSync(path, "utf-8").split("\n").filter(Boolean).flatMap((line) => { const value = ChannelExecutionEventSchema.safeParse(JSON.parse(line)); return value.success ? [value.data] : []; }); } catch { return []; }
  }
  appendEvent(username: string, channelId: string, executionId: string, input: { id?: string; type: ChannelExecutionEventType; sessionId?: string; turnId?: string; agentId?: string; payload?: Record<string, unknown> }): ChannelExecutionEvent {
    const execution = this.getExecution(username, channelId, executionId); if (!execution) throw new Error("Channel execution not found");
    const events = this.readEvents(username, channelId, executionId); const id = input.id ?? crypto.randomUUID(); const duplicate = events.find((event) => event.id === id); if (duplicate) return duplicate;
    const now = new Date().toISOString(); const event = ChannelExecutionEventSchema.parse({ ...input, id, executionId, channelId, sessionId: input.sessionId ?? execution.sessionId, sequence: execution.lastSequence + 1, createdAt: now, payload: input.payload ?? {} });
    events.push(event); atomicWrite(this.eventsPath(username, channelId, executionId), `${events.map((item) => JSON.stringify(item)).join("\n")}\n`, false);
    execution.lastSequence = event.sequence; execution.updatedAt = now;
    if (event.type === "execution_started") { execution.status = "running"; execution.startedAt = execution.startedAt ?? now; }
    if (event.type === "execution_completed") { execution.status = event.payload.withWarnings === true ? "completed_with_warnings" : "completed"; execution.completedAt = now; execution.terminalReason = typeof event.payload.reason === "string" ? event.payload.reason : undefined; }
    if (event.type === "execution_aborted") { execution.status = "aborted"; execution.completedAt = now; }
    if (event.type === "execution_failed") { execution.status = "failed"; execution.completedAt = now; }
    if (event.type === "execution_stalled") { execution.status = "stalled"; execution.completedAt = now; execution.terminalReason = typeof event.payload.reason === "string" ? event.payload.reason : undefined; }
    this.save(execution, username); return event;
  }
  getEvents(username: string, channelId: string, executionId: string, afterSequence = 0, limit = 200): ChannelExecutionEvent[] { return this.readEvents(username, channelId, executionId).filter((event) => event.sequence > afterSequence).slice(0, Math.max(1, Math.min(limit, 1000))); }
}
export const channelExecutionStore = new ChannelExecutionStore();
