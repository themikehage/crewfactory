import { TeamNegotiationEvaluator } from "./team-negotiation-evaluator";
import { ArbitrationProtocol } from "../core/negotiation/arbitration-protocol";
import { teamStore } from "./team-store";
import { DivergenceDetector } from "../laboratory/divergence-detector";
import type { Team, TeamMessage, TeamMember, ChannelMessage } from "shared";
import crypto from "node:crypto";

export interface TeamNegotiationResult {
  action: "continue" | "stop-agreed" | "stop-rejected" | "escalate";
  escalationMessage?: TeamMessage;
  arbiterMember?: TeamMember;
}

export function handleTeamNegotiation(
  username: string,
  teamId: string,
  team: Team,
  memberAgentId: string,
  incomingMsg: TeamMessage,
  agentMsg: TeamMessage,
  agentNameMap: Map<string, string>,
  broadcastFn: (teamId: string, data: any) => void
): TeamNegotiationResult {
  if (!team.negotiationProtocol) {
    return { action: "continue" };
  }

  const protocol = team.negotiationProtocol;
  const currentRound = agentMsg.round || 1;
  const state = teamStore.getNegotiationState(username, teamId);

  if (!state._rounds) {
    state._rounds = [];
  }

  let roundEntry = state._rounds.find((r) => r.roundNumber === currentRound);
  if (!roundEntry) {
    roundEntry = {
      roundNumber: currentRound,
      votes: {},
      outcome: "open",
    };
    state._rounds.push(roundEntry);
  }

  const vote = TeamNegotiationEvaluator.classifyVote(agentMsg.content, protocol);
  roundEntry.votes[memberAgentId] = vote;

  const arbiterId = protocol.arbiterAgentId;
  const activeMembers = team.members.filter(
    (m) => m.role !== "observer" && m.agentId !== arbiterId
  );
  const activeCount = activeMembers.length;
  const quorumThreshold = protocol.quorumThreshold ?? 0.51;

  const outcome = TeamNegotiationEvaluator.evaluateRound(
    roundEntry.votes,
    quorumThreshold,
    activeCount,
    currentRound,
    team.maxRounds ?? 5
  );

  roundEntry.outcome = outcome.result === "consensus"
    ? "consensus"
    : outcome.result === "conflict"
      ? "conflict"
      : outcome.result === "escalate"
        ? "escalated"
        : "open";

  if (memberAgentId === arbiterId && agentMsg.content.includes("RESOLUTION:")) {
    state._arbitrations = (state._arbitrations || 0) + 1;
  }

  teamStore.saveNegotiationState(username, teamId, state);

  broadcastFn(teamId, {
    type: "team_negotiation_round",
    teamId,
    sessionId: incomingMsg.sessionId,
    agentId: memberAgentId,
    receiverId: "user",
    rounds: currentRound,
    status: roundEntry.outcome,
  });

  const messages = teamStore.getMessages(username, teamId, 100, incomingMsg.sessionId);
  const allMessages = [...messages, agentMsg];
  const channelMessages = allMessages as unknown as ChannelMessage[];
  const divergence = DivergenceDetector.detect(channelMessages);

  if (divergence && arbiterId) {
    const arbiterName = agentNameMap.get(arbiterId) || arbiterId;

    broadcastFn(teamId, {
      type: "team_negotiation_divergence",
      teamId,
      sessionId: incomingMsg.sessionId,
      divergence,
    });

    state._divergences = (state._divergences || 0) + 1;
    teamStore.saveNegotiationState(username, teamId, state);

    broadcastFn(teamId, {
      type: "team_negotiation_escalation",
      teamId,
      sessionId: incomingMsg.sessionId,
      arbiterId,
      arbiterName,
      rounds: currentRound,
      reason: divergence.reason,
    });

    const escalationMsg: TeamMessage = {
      id: crypto.randomUUID(),
      teamId,
      sessionId: incomingMsg.sessionId,
      role: "system",
      content: `[DIVERGENCIA DETECTADA] ${divergence.reason}\n\n@${arbiterName}, emite una resolución formal vinculante para resolver este bloqueo.`,
      round: currentRound,
      createdAt: new Date().toISOString(),
    };

    const arbiterMember = team.members.find((m) => m.agentId === arbiterId);
    return {
      action: "escalate",
      escalationMessage: escalationMsg,
      arbiterMember,
    };
  }

  if (outcome.result === "consensus") {
    broadcastFn(teamId, {
      type: "team_negotiation_agreement",
      teamId,
      sessionId: incomingMsg.sessionId,
      agentId: memberAgentId,
      receiverId: "user",
      content: agentMsg.content,
    });
    return { action: "stop-agreed" };
  }

  if (outcome.result === "conflict") {
    const triggerId = outcome.triggerAgentId;
    broadcastFn(teamId, {
      type: "team_negotiation_rejected",
      teamId,
      sessionId: incomingMsg.sessionId,
      agentId: triggerId,
      receiverId: "user",
    });

    if (arbiterId) {
      const arbiterName = agentNameMap.get(arbiterId) || arbiterId;
      broadcastFn(teamId, {
        type: "team_negotiation_escalation",
        teamId,
        sessionId: incomingMsg.sessionId,
        arbiterId,
        arbiterName,
        rounds: currentRound,
      });

      const agentName = agentNameMap.get(triggerId) || triggerId;
      const arbiterProtocol = new ArbitrationProtocol({ arbiterAgentId: arbiterId });
      const escalationMsg = arbiterProtocol.buildEscalationMessage({
        senderId: triggerId,
        senderName: agentName,
        receiverId: "user",
        receiverName: "user",
        rounds: currentRound,
        channelId: teamId,
        sessionId: incomingMsg.sessionId,
      });

      const arbiterMember = team.members.find((m) => m.agentId === arbiterId);
      const teamEscalationMsg: TeamMessage = {
        ...escalationMsg as unknown as TeamMessage,
        round: currentRound,
      };

      return {
        action: "escalate",
        escalationMessage: teamEscalationMsg,
        arbiterMember,
      };
    }

    return { action: "stop-rejected" };
  }

  if (outcome.result === "escalate") {
    if (arbiterId) {
      const arbiterName = agentNameMap.get(arbiterId) || arbiterId;
      broadcastFn(teamId, {
        type: "team_negotiation_escalation",
        teamId,
        sessionId: incomingMsg.sessionId,
        arbiterId,
        arbiterName,
        rounds: currentRound,
      });

      const arbiterProtocol = new ArbitrationProtocol({ arbiterAgentId: arbiterId });
      const escalationMsg = arbiterProtocol.buildEscalationMessage({
        senderId: "system",
        senderName: "consensus_timeout",
        receiverId: "user",
        receiverName: "user",
        rounds: currentRound,
        channelId: teamId,
        sessionId: incomingMsg.sessionId,
      });

      const arbiterMember = team.members.find((m) => m.agentId === arbiterId);
      const teamEscalationMsg: TeamMessage = {
        ...escalationMsg as unknown as TeamMessage,
        round: currentRound,
      };

      return {
        action: "escalate",
        escalationMessage: teamEscalationMsg,
        arbiterMember,
      };
    }

    return { action: "stop-rejected" };
  }

  return { action: "continue" };
}
