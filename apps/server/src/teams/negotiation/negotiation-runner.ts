import { teamStore } from "../team-store";
import { type TeamMessage, type TeamMember } from "shared";
import { TeamPromptRunner } from "../team-prompt-runner";
import { buildAgentNameMap } from "../../core/multi-agent/agent-prompt-runner";
import { isSubstantiveMessage } from "../team-prompt-runner";
import type { ActiveTeamStream } from "../team-prompt-runner";


type BroadcastFn = (teamId: string, data: any) => void;

export class NegotiationRunner {
  private abortedDispatches = new Set<string>();
  private teamAbortControllers = new Map<string, AbortController>();
  private activeStreams = new Map<string, Map<string, ActiveTeamStream>>();
  private activeChains = new Map<string, { count: number; resolve: () => void }>();
  private promptRunner: TeamPromptRunner;
  private broadcastFn: BroadcastFn;

  constructor(broadcastFn: BroadcastFn) {
    this.broadcastFn = broadcastFn;
    this.promptRunner = new TeamPromptRunner(this.activeStreams, broadcastFn);
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

  abort(teamId: string, sessionId?: string): void {
    const key = `${teamId}:${sessionId || "default"}`;
    this.abortedDispatches.add(key);
    this.activeStreams.delete(key);

    const controller = this.teamAbortControllers.get(key);
    controller?.abort();
    this.teamAbortControllers.delete(key);

    this.broadcastFn(teamId, { type: "team_dispatch_aborted", teamId, sessionId });
  }

  async dispatch(
    username: string,
    teamId: string,
    userMsg: TeamMessage,
    sessionId?: string
  ): Promise<void> {
    const key = `${teamId}:${sessionId || "default"}`;
    this.abortedDispatches.delete(key);

    const team = teamStore.getTeam(username, teamId);
    if (!team) throw new Error("Team not found");

    if (!isSubstantiveMessage(userMsg.content)) {
      const guidanceMsg: TeamMessage = {
        id: crypto.randomUUID(),
        teamId,
        sessionId,
        role: "system",
        content: "Para iniciar un debate de negociación, por favor especifica el tema o la propuesta a analizar.",
        createdAt: new Date().toISOString(),
      };
      teamStore.appendMessage(username, teamId, guidanceMsg);
      this.broadcastFn(teamId, {
        type: "team_message",
        teamId,
        sessionId,
        message: guidanceMsg,
        eventType: "agent_message",
      });
      return;
    }

    const controller = new AbortController();
    this.teamAbortControllers.set(key, controller);

    let resolveChain: () => void = () => {};
    const chainPromise = new Promise<void>((resolve) => {
      resolveChain = resolve;
    });
    this.activeChains.set(key, { count: 1, resolve: resolveChain });

    this.runDebateLoop(username, teamId, userMsg, controller, controller.signal)
      .catch((err) => {
        console.error("[NegotiationRunner] Loop error:", err);
      })
      .finally(() => {
        const entry = this.activeChains.get(key);
        if (entry) {
          entry.count--;
          if (entry.count <= 0) {
            entry.resolve();
            this.activeChains.delete(key);
          }
        }
      });

    return chainPromise;
  }

  private async runDebateLoop(
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

    let currentIncomingMsg: TeamMessage = team.negotiationProtocol
      ? {
          ...initialMsg,
          content: `[DEBATE - RONDA 1]\nPropuesta/Tema a debatir:\n"""\n${initialMsg.content}\n"""\n\nEvalúa esta propuesta según tu especialidad y el protocolo de negociación (SCORE/DIVERGENCE/OBJECTION/VETO/ACUERDO).`,
        }
      : initialMsg;

    const agentNameMap = buildAgentNameMap(team.members as any);
    const { TeamNegotiationEvaluator } = await import("../team-negotiation-evaluator");

    while (round <= maxRounds && !signal.aborted && !this.abortedDispatches.has(key)) {
      console.log(`[NegotiationRunner] Round ${round} starting...`);

      const arbiterId = team.negotiationProtocol?.arbiterAgentId;
      const activeMembers = team.members.filter(
        (m) => m.role !== "observer" && m.agentId !== arbiterId
      );
      if (activeMembers.length === 0) return;

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
          teamStore.appendMessage(username, teamId, res.agentMsg);
          this.broadcastFn(teamId, {
            type: "team_message",
            teamId,
            sessionId: initialMsg.sessionId,
            message: res.agentMsg,
            eventType: "agent_message",
          });
        }
      }

      if (signal.aborted || this.abortedDispatches.has(key)) return;
      if (activeResults.length === 0) return;

      let stopLoop = false;
      let escalationMsg: TeamMessage | null = null;
      let arbiterMember: TeamMember | null = null;

      if (team.negotiationProtocol) {
        const protocol = team.negotiationProtocol;
        const quorumThreshold = protocol.quorumThreshold ?? 0.51;
        const roundVotes: Record<string, import("../team-negotiation-evaluator").AgentVote> = {};

        for (const res of activeResults) {
          roundVotes[res.agentMsg.agentId!] = TeamNegotiationEvaluator.classifyVote(
            res.agentMsg.content,
            protocol
          );
        }

        const outcome = TeamNegotiationEvaluator.evaluateRound(
          roundVotes,
          quorumThreshold,
          activeMembers.length,
          round,
          team.maxRounds ?? 5
        );

        this.broadcastFn(teamId, {
          type: "team_negotiation_round",
          teamId,
          sessionId: initialMsg.sessionId,
          rounds: round,
          status: outcome.result,
          votes: roundVotes,
        });

        if (outcome.result === "consensus") {
          this.broadcastFn(teamId, {
            type: "team_negotiation_agreement",
            teamId,
            sessionId: initialMsg.sessionId,
            content: activeResults[activeResults.length - 1].agentMsg.content,
          });
          return;
        }

        if (outcome.result === "conflict" || outcome.result === "escalate") {
          const triggerAgentId = outcome.result === "conflict"
            ? (outcome as any).triggerAgentId
            : undefined;

          if (triggerAgentId) {
            this.broadcastFn(teamId, {
              type: "team_negotiation_rejected",
              teamId,
              sessionId: initialMsg.sessionId,
              agentId: triggerAgentId,
            });
          }

          if (arbiterId) {
            const arbiterName = agentNameMap.get(arbiterId) || arbiterId;
            this.broadcastFn(teamId, {
              type: "team_negotiation_escalation",
              teamId,
              sessionId: initialMsg.sessionId,
              arbiterId,
              arbiterName,
              rounds: round,
            });

            const { ArbitrationProtocol } = await import("../../core/negotiation/arbitration-protocol");
            const arbiterProtocol = new ArbitrationProtocol({ arbiterAgentId: arbiterId });
            escalationMsg = {
              ...arbiterProtocol.buildEscalationMessage({
                senderId: triggerAgentId || "system",
                senderName: agentNameMap.get(triggerAgentId) || "system",
                receiverId: "user",
                receiverName: "user",
                rounds: round,
                teamId,
                sessionId: initialMsg.sessionId,
              }) as unknown as TeamMessage,
              round,
            };
            arbiterMember = team.members.find((m) => m.agentId === arbiterId) ?? null;
          } else {
            stopLoop = true;
          }
        }
      }

      if (stopLoop) return;

      if (escalationMsg && arbiterMember) {
        teamStore.appendMessage(username, teamId, escalationMsg);
        this.broadcastFn(teamId, {
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
          this.broadcastFn(teamId, {
            type: "team_message",
            teamId,
            sessionId: initialMsg.sessionId,
            message: arbiterResult.agentMsg,
            eventType: "agent_message",
          });
          const negState = teamStore.getNegotiationState(username, teamId);
          negState._arbitrations = (negState._arbitrations || 0) + 1;
          teamStore.saveNegotiationState(username, teamId, negState);
        }
        return;
      }

      const roundSummary = activeResults
        .map((r) => `[${r.agentMsg.agentName || r.agentMsg.agentId}]: ${r.agentMsg.content}`)
        .join("\n\n---\n\n");

      currentIncomingMsg = {
        ...initialMsg,
        content: `[DEBATE - RONDA ${round + 1}]\nPropuesta original:\n"""\n${initialMsg.content}\n"""\n\nPosturas de ronda ${round}:\n"""\n${roundSummary}\n"""\n\nConsidera las posiciones anteriores y emite tu evaluación actualizada según el protocolo de negociación.`,
      };

      round++;
    }

    if (round > maxRounds) {
      this.broadcastFn(teamId, { type: "team_chain_limit", teamId, maxRounds });
    }
  }
}
