import { teamStore } from "./team-store";
import { teamRunStore } from "./team-run-store";
import { runTeamTurn } from "./team-turn-runner";
import { agentRegistry } from "../agents";
import type { TeamDefinition, TeamMember, TeamMessage, TeamEvent, TeamEventType } from "shared";

export class TeamBusyError extends Error {
  readonly code = "team_busy";
  constructor(readonly runId?: string) {
    super("Team already has an active run in this session");
    this.name = "TeamBusyError";
  }
}

type BroadcastFn = (teamId: string, event: TeamEvent) => void;
let broadcastFn: BroadcastFn | null = null;

export function setTeamBroadcastHandler(fn: BroadcastFn): void {
  broadcastFn = fn;
}

function broadcast(teamId: string, event: TeamEvent): void {
  if (broadcastFn) broadcastFn(teamId, event);
}

interface ActiveRun {
  username: string;
  runId: string;
  controller: AbortController;
}

function buildInitialQueue(team: TeamDefinition): TeamMember[] {
  const ordered = [...team.members].sort((a, b) => a.order - b.order);
  if (team.topology === "roundtable") {
    return ordered;
  }
  const leader = ordered.find((m) => m.role === "leader");
  return leader ? [leader] : ordered.slice(0, 1);
}

function resolveNextTurns(
  team: TeamDefinition,
  completedMember: TeamMember,
  _agentMsg: TeamMessage,
  remainingQueue: TeamMember[]
): TeamMember[] {
  const ordered = [...team.members].sort((a, b) => a.order - b.order);

  if (team.topology === "roundtable") {
    return [];
  }

  if (team.topology === "leader_specialists") {
    if (completedMember.role === "leader") {
      const specialists = ordered.filter((m) => m.role === "specialist");
      if (specialists.length > 0 && remainingQueue.every((m) => m.role !== "specialist")) {
        return specialists;
      }
      return [];
    }

    if (completedMember.role === "specialist") {
      const allSpecialists = ordered.filter((m) => m.role === "specialist");
      const alreadyQueued = remainingQueue.map((m) => m.agentId);
      const remainingSpecialists = allSpecialists.filter(
        (s) => s.agentId !== completedMember.agentId && !alreadyQueued.includes(s.agentId)
      );
      if (remainingSpecialists.length > 0) return [];
      const leader = ordered.find((m) => m.role === "leader");
      const leaderAlreadyQueued = remainingQueue.some((m) => m.role === "leader");
      if (leader && !leaderAlreadyQueued) return [leader];
      return [];
    }
  }

  return [];
}

class TeamRunner {
  private activeRuns = new Map<string, ActiveRun>();

  private runKey(teamId: string, sessionId: string): string {
    return `${teamId}:${sessionId}`;
  }

  isRunning(teamId: string, sessionId: string): boolean {
    return this.activeRuns.has(this.runKey(teamId, sessionId));
  }

  getActiveRunId(teamId: string, sessionId: string): string | undefined {
    return this.activeRuns.get(this.runKey(teamId, sessionId))?.runId;
  }

  async abort(username: string, teamId: string, sessionId: string): Promise<boolean> {
    const key = this.runKey(teamId, sessionId);
    const active = this.activeRuns.get(key);
    if (!active) return false;

    active.controller.abort();

    for (const member of teamStore.getTeam(username, teamId)?.members ?? []) {
      const entry = agentRegistry.get(member.agentId);
      if (entry?.server.session.isStreaming) {
        entry.server.session.abort().catch(() => {});
      }
    }

    return true;
  }

  async executeRun(username: string, teamId: string, sessionId: string, task: string): Promise<void> {
    const key = this.runKey(teamId, sessionId);
    if (this.activeRuns.has(key)) {
      const existing = this.activeRuns.get(key)!;
      throw new TeamBusyError(existing.runId);
    }

    const team = teamStore.getTeam(username, teamId);
    if (!team) throw new Error("Team not found");
    if (team.members.length === 0) throw new Error("Team has no members");

    const run = teamRunStore.createRun(username, teamId, { sessionId, task });
    const controller = new AbortController();
    this.activeRuns.set(key, { username, runId: run.id, controller });

    teamStore.updateSession(username, teamId, sessionId, { lastRunId: run.id });

    const broadcastEvent = (
      type: TeamEventType,
      agentId?: string,
      agentName?: string,
      payload: Record<string, unknown> = {},
      toolCallId?: string
    ) => {
      const event = teamRunStore.appendEvent(username, teamId, run.id, {
        type,
        agentId,
        agentName,
        toolCallId,
        payload,
      });
      broadcast(teamId, event);
    };

    broadcastEvent("run_started", undefined, undefined, { task, sessionId });

    try {
      let sessionMessages: TeamMessage[] = teamStore.getSessionMessages(username, teamId, sessionId, 50);

      const userMsg: TeamMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: task,
        createdAt: new Date().toISOString(),
      };
      teamStore.appendSessionMessage(username, teamId, sessionId, userMsg);
      sessionMessages = [...sessionMessages, userMsg];

      const queue: TeamMember[] = buildInitialQueue(team);

      while (queue.length > 0 && !controller.signal.aborted) {
        const member = queue.shift()!;

        const turn = teamRunStore.createTurn(username, teamId, run.id, member.agentId);

        const result = await runTeamTurn(
          username,
          team,
          sessionId,
          member,
          sessionMessages,
          controller.signal,
          (type, agentId, agentName, payload, toolCallId) => broadcastEvent(type, agentId, agentName, payload, toolCallId)
        );

        if (controller.signal.aborted) {
          teamRunStore.updateTurn(username, teamId, run.id, turn.id, "skipped", { skipReason: "aborted" });
          break;
        }

        if (result.agentMsg) {
          teamRunStore.updateTurn(username, teamId, run.id, turn.id, "completed", { messageId: result.agentMsg.id });
          teamStore.appendSessionMessage(username, teamId, sessionId, result.agentMsg);
          sessionMessages = [...sessionMessages, result.agentMsg];

          const nextTurns = resolveNextTurns(team, member, result.agentMsg, queue);
          queue.push(...nextTurns);
        } else {
          teamRunStore.updateTurn(username, teamId, run.id, turn.id, "skipped", { skipReason: "silent" });
        }
      }

      if (controller.signal.aborted) {
        teamRunStore.finishOpenTurns(username, teamId, run.id, "aborted");
        broadcastEvent("run_aborted", undefined, undefined, {});
      } else {
        broadcastEvent("run_completed", undefined, undefined, {});
      }
    } catch (err: any) {
      console.error(`[TeamRunner] Run ${run.id} failed:`, err);
      teamRunStore.finishOpenTurns(username, teamId, run.id, "aborted");
      const event = teamRunStore.appendEvent(username, teamId, run.id, {
        type: "run_failed",
        payload: { error: String(err.message || err) },
      });
      broadcast(teamId, event);
    } finally {
      this.activeRuns.delete(key);
    }
  }
}

export const teamRunner = new TeamRunner();
