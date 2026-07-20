import { teamStore } from "./team-store";
import { type TeamMessage, SessionPrefix } from "shared";
import { buildAgentNameMap } from "../core/multi-agent/agent-prompt-runner";
import { parseMentions } from "../core/multi-agent/mention-parser";
import { OrchestrationRunner } from "./orchestration/orchestration-runner";
import { NegotiationRunner } from "./negotiation/negotiation-runner";
import type { ActiveTeamStream } from "./team-prompt-runner";

type TeamBroadcastFn = (teamId: string, data: any) => void;
let broadcastToTeamFn: TeamBroadcastFn | null = null;

export function setTeamBroadcastHandler(fn: TeamBroadcastFn) {
  broadcastToTeamFn = fn;
}

function broadcast(teamId: string, data: any) {
  broadcastToTeamFn?.(teamId, data);
}

export class TeamOrchestrator {
  private orchestrationRunner: OrchestrationRunner;
  private negotiationRunner: NegotiationRunner;

  constructor() {
    this.orchestrationRunner = new OrchestrationRunner(broadcast);
    this.negotiationRunner = new NegotiationRunner(broadcast);
  }

  getActiveStreams(teamId: string, sessionId?: string): Record<string, ActiveTeamStream> {
    return this.negotiationRunner.getActiveStreams(teamId, sessionId);
  }

  abortDispatch(username: string, teamId: string, sessionId?: string): void {
    const team = teamStore.getTeam(username, teamId);
    if (!team) return;

    if (team.teamType === "Orchestration") {
      this.orchestrationRunner.abort(username, teamId);
      broadcast(teamId, { type: "team_dispatch_aborted", teamId, sessionId });
      return;
    }

    this.negotiationRunner.abort(teamId, sessionId);
  }

  async dispatchUserMessage(
    username: string,
    teamId: string,
    userContent: string,
    sessionId?: string
  ): Promise<void> {
    const team = teamStore.getTeam(username, teamId);
    if (!team) throw new Error("Team not found");

    if (team.teamType === "Orchestration") {
      await this.orchestrationRunner.dispatch(username, teamId, userContent, sessionId);
      return;
    }

    const agentNameMap = buildAgentNameMap(team.members as any);
    const mentions = parseMentions(userContent, team.members as any, agentNameMap);

    const userMsg: TeamMessage = {
      id: crypto.randomUUID(),
      teamId,
      sessionId,
      role: "user",
      content: userContent,
      mentions: mentions.length > 0 ? mentions : undefined,
      createdAt: new Date().toISOString(),
    };

    teamStore.appendMessage(username, teamId, userMsg);
    broadcast(teamId, {
      type: "team_message",
      teamId,
      sessionId,
      message: userMsg,
      eventType: "user_message",
    });

    teamStore.resetNegotiationState(username, teamId);

    await this.negotiationRunner.dispatch(username, teamId, userMsg, sessionId);
  }
}

export const teamOrchestrator = new TeamOrchestrator();
