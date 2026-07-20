import { teamStore } from "./team-store";
import { agentRegistry } from "../agents";
import { type Team, type TeamMember, type TeamMessage, SessionPrefix, getTeamWorkspaceDir } from "shared";
import { TeamPromptRunner, type ActiveTeamStream } from "./team-prompt-runner";
import { handleTeamNegotiation } from "./team-negotiation";
import { buildAgentNameMap } from "../channels/agent-prompt-runner";
import { parseMentions } from "../channels/mention-parser";
import { sessionManager } from "../core/session-manager";

type TeamBroadcastFn = (teamId: string, data: any) => void;
let broadcastToTeamFn: TeamBroadcastFn | null = null;

export function setTeamBroadcastHandler(fn: TeamBroadcastFn) {
  broadcastToTeamFn = fn;
}

function broadcast(teamId: string, data: any) {
  if (broadcastToTeamFn) {
    broadcastToTeamFn(teamId, data);
  }
}

export class TeamOrchestrator {
  private abortedDispatches = new Set<string>();
  private teamAbortControllers = new Map<string, AbortController>();
  private activeStreams = new Map<string, Map<string, ActiveTeamStream>>();
  private activeChains = new Map<string, { count: number; resolve: () => void }>();
  private promptRunner: TeamPromptRunner;

  constructor() {
    this.promptRunner = new TeamPromptRunner(this.activeStreams, broadcast);
  }

  private incrementChain(key: string) {
    const entry = this.activeChains.get(key);
    if (entry) {
      entry.count++;
    }
  }

  private decrementChain(key: string) {
    const entry = this.activeChains.get(key);
    if (entry) {
      entry.count--;
      if (entry.count <= 0) {
        entry.resolve();
        this.activeChains.delete(key);
      }
    }
  }

  getActiveStreams(teamId: string, sessionId?: string): Record<string, ActiveTeamStream> {
    const key = `${teamId}:${sessionId || "default"}`;
    const map = this.activeStreams.get(key);
    if (!map) return {};

    const result: Record<string, ActiveTeamStream> = {};
    for (const [agentId, stream] of map.entries()) {
      result[agentId] = stream;
    }
    return result;
  }

  abortDispatch(username: string, teamId: string, sessionId?: string): void {
    const team = teamStore.getTeam(username, teamId);
    if (team && team.teamType === "Orchestration") {
      const ownerSessionId = `${SessionPrefix.TEAM}${teamId}`;
      const session = sessionManager.getSession(username, ownerSessionId);
      if (session) {
        session.abort().catch(() => {});
      }
      import("../core/delegation-registry").then(({ delegationRegistry }) => {
        delegationRegistry.abortAllRecursive(ownerSessionId);
      }).catch(console.error);
      return;
    }

    const key = `${teamId}:${sessionId || "default"}`;
    this.abortedDispatches.add(key);
    console.log(`[TeamOrchestrator] Aborting dispatch for ${key}`);

    this.activeStreams.delete(key);

    const controller = this.teamAbortControllers.get(key);
    controller?.abort();
    this.teamAbortControllers.delete(key);

    if (team) {
      for (const member of team.members) {
        const entry = agentRegistry.get(member.agentId);
        if (entry && entry.server.session.isStreaming) {
          entry.server.session.abort().catch(() => {});
        }
      }
    }

    broadcast(teamId, { type: "team_dispatch_aborted", teamId, sessionId });
  }

  async dispatchUserMessage(
    username: string,
    teamId: string,
    userContent: string,
    sessionId?: string
  ): Promise<void> {
    const key = `${teamId}:${sessionId || "default"}`;
    this.abortedDispatches.delete(key);

    const team = teamStore.getTeam(username, teamId);
    if (!team) throw new Error("Team not found");

    if (team.teamType === "Orchestration") {
      const leader = team.members.find((member) => member.role === "lead");
      if (!leader) {
        throw new Error("Orchestration leader not found");
      }
      const ownerSessionId = `${SessionPrefix.TEAM}${team.id}`;
      const meta = sessionManager.metadataStore.getSessionMetadata(username, ownerSessionId);
      if (!meta) {
        const now = new Date().toISOString();
        sessionManager.metadataStore.saveSessionMetadata(username, ownerSessionId, {
          name: `${team.name} — Orchestration`,
          createdAt: now,
          updatedAt: now,
          agentId: leader.agentId,
          teamId: team.id,
        });
      }
      const session = await sessionManager.getOrCreateSession(username, ownerSessionId, undefined, leader.agentId, undefined, {
        workspaceDir: getTeamWorkspaceDir(username, team.id),
      });
      session.prompt(userContent).catch((err) => {
        console.error(`[TeamOrchestrator] Persistent session prompt error:`, err);
      });
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

    const controller = new AbortController();
    this.teamAbortControllers.set(key, controller);

    let resolveChain: () => void = () => {};
    const chainPromise = new Promise<void>((resolve) => {
      resolveChain = resolve;
    });
    this.activeChains.set(key, { count: 0, resolve: resolveChain });

    this.incrementChain(key);
    const runLoopPromise = this.runStatelessDebateLoop(username, teamId, userMsg, controller, controller.signal);

    runLoopPromise
      .catch((err) => {
        console.error(`[TeamOrchestrator] Loop error:`, err);
      })
      .finally(() => {
        this.decrementChain(key);
      });

    return chainPromise;
  }

  private async runOrchestrationLoop(
    username: string,
    teamId: string,
    initialMsg: TeamMessage,
    controller: AbortController,
    signal: AbortSignal
  ): Promise<void> {
    const key = `${teamId}:${initialMsg.sessionId || "default"}`;
    const team = teamStore.getTeam(username, teamId);
    if (!team || team.members.length === 0) return;

    // Find the leader
    const leaderMember = team.members.find((m) => m.role === "lead");
    if (!leaderMember) {
      console.warn(`[TeamOrchestrator] Orchestration mode requires a leader. None found.`);
      return;
    }

    console.log(`[TeamOrchestrator] Orchestration Loop starting for leader ${leaderMember.agentId}...`);
    const agentNameMap = buildAgentNameMap(team.members as any);
    const recentHistory = teamStore.getMessages(username, teamId, 40, initialMsg.sessionId);

    // Call leader agent statelessly (stub implementation)
    // TODO: Phase 154 - shared workspace + specialist delegation
    const res = await this.promptRunner.runStateless(
      username,
      teamId,
      leaderMember,
      initialMsg,
      recentHistory,
      agentNameMap,
      signal
    );

    if (signal.aborted || this.abortedDispatches.has(key)) return;

    if (res.agentMsg) {
      teamStore.appendMessage(username, teamId, res.agentMsg);
      broadcast(teamId, {
        type: "team_message",
        teamId,
        sessionId: initialMsg.sessionId,
        message: res.agentMsg,
        eventType: "agent_message",
      });
    }
  }

  private async runStatelessDebateLoop(
    username: string,
    teamId: string,
    initialMsg: TeamMessage,
    controller: AbortController,
    signal: AbortSignal
  ): Promise<void> {
    const key = `${teamId}:${initialMsg.sessionId || "default"}`;
    const team = teamStore.getTeam(username, teamId);
    if (!team || team.members.length === 0) return;

    const maxRounds = team.maxRounds ?? 5;
    let round = 1;
    let currentIncomingMsg = initialMsg;

    while (round <= maxRounds && !signal.aborted && !this.abortedDispatches.has(key)) {
      console.log(`[TeamOrchestrator] Stateless Team Debate Round ${round} starting...`);

      const arbiterId = team.negotiationProtocol?.arbiterAgentId;
      const activeMembers = team.members.filter(
        (m) => m.role !== "observer" && m.agentId !== arbiterId
      );

      if (activeMembers.length === 0) return;

      const agentNameMap = buildAgentNameMap(
        team.members.map((m) => ({
          agentId: m.agentId,
          replyMode: "broadcast",
        }))
      );

      const activeResults: { agentMsg: TeamMessage }[] = [];
      for (const member of activeMembers) {
        if (signal.aborted || this.abortedDispatches.has(key)) return;
        const recentHistory = teamStore.getMessages(username, teamId, 40, initialMsg.sessionId);
        const res = await this.promptRunner.runStateless(
          username,
          teamId,
          member,
          currentIncomingMsg,
          recentHistory,
          agentNameMap,
          signal
        );
        if (res.agentMsg) {
          res.agentMsg.round = round;
          activeResults.push(res as { agentMsg: TeamMessage });
          currentIncomingMsg = res.agentMsg;
          teamStore.appendMessage(username, teamId, res.agentMsg);
          broadcast(teamId, {
            type: "team_message",
            teamId,
            sessionId: initialMsg.sessionId,
            message: res.agentMsg,
            eventType: "agent_message",
          });
        }
      }

      if (signal.aborted || this.abortedDispatches.has(key)) return;

      if (activeResults.length === 0) {
        console.log(`[TeamOrchestrator] All agents silent in team debate round ${round}. Stopping.`);
        return;
      }

      let stopLoop = false;
      let escalationMsg: TeamMessage | null = null;
      let arbiterMember: TeamMember | null = null;

      for (const res of activeResults) {
        const negResult = handleTeamNegotiation(
          username,
          teamId,
          team,
          res.agentMsg.agentId!,
          initialMsg,
          res.agentMsg,
          agentNameMap,
          broadcast
        );

        if (negResult.action === "stop-agreed" || negResult.action === "stop-rejected") {
          stopLoop = true;
          break;
        }

        if (negResult.action === "escalate" && negResult.escalationMessage && negResult.arbiterMember) {
          escalationMsg = negResult.escalationMessage;
          arbiterMember = negResult.arbiterMember;
          break;
        }
      }

      if (stopLoop) {
        console.log(`[TeamOrchestrator] Consensus or reject reached. Terminating debate.`);
        return;
      }

      if (escalationMsg && arbiterMember) {
        const negotiationState = teamStore.getNegotiationState(username, teamId);
        const currentArbitrations = negotiationState._arbitrations || 0;

        if (currentArbitrations >= 3) {
          console.log(`[TeamOrchestrator] Max arbitrations reached (${currentArbitrations}). Stopping debate.`);
          return;
        }

        console.log(`[TeamOrchestrator] Escalation triggered. Invoking arbiter ${arbiterMember.agentId} statelessly.`);
        teamStore.appendMessage(username, teamId, escalationMsg);
        broadcast(teamId, {
          type: "team_message",
          teamId,
          sessionId: initialMsg.sessionId,
          message: escalationMsg,
          eventType: "agent_message",
        });

        const arbiterHistory = teamStore.getMessages(username, teamId, 40, initialMsg.sessionId);
        const arbiterResult = await this.promptRunner.runStateless(
          username,
          teamId,
          arbiterMember,
          escalationMsg,
          arbiterHistory,
          agentNameMap,
          signal
        );

        if (arbiterResult.agentMsg) {
          arbiterResult.agentMsg.round = round;
          teamStore.appendMessage(username, teamId, arbiterResult.agentMsg);
          broadcast(teamId, {
            type: "team_message",
            teamId,
            sessionId: initialMsg.sessionId,
            message: arbiterResult.agentMsg,
            eventType: "agent_message",
          });
          currentIncomingMsg = arbiterResult.agentMsg;
        }
      }

      round++;
    }

    if (round > maxRounds) {
      console.warn(`[TeamOrchestrator] Max rounds reached (${maxRounds}) for team ${teamId}`);
      broadcast(teamId, { type: "team_chain_limit", teamId, maxRounds });
    }
  }
}

export const teamOrchestrator = new TeamOrchestrator();
