import { NegotiationProtocol } from "../core/negotiation/negotiation-protocol";
import { ArbitrationProtocol } from "../core/negotiation/arbitration-protocol";
import { teamStore } from "./team-store";
import { DivergenceDetector } from "../laboratory/divergence-detector";
import type { Team, TeamMessage, TeamMember } from "shared";
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

  const negotiationState = teamStore.getNegotiationState(username, teamId);
  const protocol = new NegotiationProtocol(team.negotiationProtocol, negotiationState);
  const receiverId = incomingMsg.role === "user" ? "user" : incomingMsg.agentId || "user";
  const senderId = memberAgentId;
  const ingestResult = protocol.ingest(senderId, receiverId, agentMsg.content);

  // If the arbitrator resolved, increment arbitration count
  const updatedState = protocol.getState();
  if (memberAgentId === team.negotiationProtocol.arbiterAgentId && agentMsg.content.includes("RESOLUTION:")) {
    updatedState._arbitrations = (updatedState._arbitrations || 0) + 1;
  }
  teamStore.saveNegotiationState(username, teamId, updatedState);

  broadcastFn(teamId, {
    type: "team_negotiation_round",
    teamId,
    sessionId: incomingMsg.sessionId,
    agentId: senderId,
    receiverId,
    rounds: ingestResult.rounds,
    status: protocol.getState()[ingestResult.pairKey]?.status || "open",
  });

  // Divergence Detection Check
  const messages = teamStore.getMessages(username, teamId, 100, incomingMsg.sessionId);
  const allMessages = [...messages, agentMsg];
  // DivergenceDetector expects ChannelMessage but TeamMessage is structurally compatible
  const divergence = DivergenceDetector.detect(allMessages as any);

  if (divergence && team.negotiationProtocol.arbiterAgentId) {
    const arbiterId = team.negotiationProtocol.arbiterAgentId;
    const arbiterName = agentNameMap.get(arbiterId) || arbiterId;

    // Broadcast divergence event
    broadcastFn(teamId, {
      type: "team_negotiation_divergence",
      teamId,
      sessionId: incomingMsg.sessionId,
      divergence,
    });

    // Save escalation and increment divergence count in negotiation state
    const pairKey = [senderId, receiverId].sort().join(":");
    const updatedStateWithDivergence = protocol.getState();
    updatedStateWithDivergence._divergences = (updatedStateWithDivergence._divergences || 0) + 1;
    if (!updatedStateWithDivergence[pairKey]) {
      updatedStateWithDivergence[pairKey] = { rounds: ingestResult.rounds, lastOffer: agentMsg.content.slice(0, 500), status: "escalated" };
    } else {
      updatedStateWithDivergence[pairKey].status = "escalated";
    }
    teamStore.saveNegotiationState(username, teamId, updatedStateWithDivergence);

    // Broadcast escalation event
    broadcastFn(teamId, {
      type: "team_negotiation_escalation",
      teamId,
      sessionId: incomingMsg.sessionId,
      arbiterId,
      arbiterName,
      rounds: ingestResult.rounds,
      reason: divergence.reason
    });

    const escalationMsg: TeamMessage = {
      id: crypto.randomUUID(),
      teamId,
      sessionId: incomingMsg.sessionId,
      role: "system",
      content: `[DIVERGENCIA DETECTADA] ${divergence.reason}\n\n@${arbiterName}, emite una resolución formal vinculante para resolver este bloqueo.`,
      createdAt: new Date().toISOString(),
    };

    const arbiterMember = team.members.find((m) => m.agentId === arbiterId);
    return {
      action: "escalate",
      escalationMessage: escalationMsg,
      arbiterMember,
    };
  }

  if (ingestResult.matched === "agreed") {
    broadcastFn(teamId, {
      type: "team_negotiation_agreement",
      teamId,
      sessionId: incomingMsg.sessionId,
      agentId: senderId,
      receiverId,
      content: agentMsg.content,
    });
    return { action: "stop-agreed" };
  }

  if (ingestResult.matched === "rejected") {
    broadcastFn(teamId, {
      type: "team_negotiation_rejected",
      teamId,
      sessionId: incomingMsg.sessionId,
      agentId: senderId,
      receiverId,
    });
    return { action: "stop-rejected" };
  }

  if (ingestResult.shouldEscalate && team.negotiationProtocol.arbiterAgentId) {
    const arbiterId = team.negotiationProtocol.arbiterAgentId;
    const arbiterName = agentNameMap.get(arbiterId) || arbiterId;

    broadcastFn(teamId, {
      type: "team_negotiation_escalation",
      teamId,
      sessionId: incomingMsg.sessionId,
      arbiterId,
      arbiterName,
      rounds: ingestResult.rounds,
    });

    const agentName = agentNameMap.get(senderId) || senderId;
    const targetName = receiverId === "user" ? "user" : agentNameMap.get(receiverId) || receiverId;
    const arbiterProtocol = new ArbitrationProtocol({ arbiterAgentId: arbiterId });
    const escalationMsg = arbiterProtocol.buildEscalationMessage({
      senderId,
      senderName: agentName,
      receiverId,
      receiverName: targetName,
      rounds: ingestResult.rounds,
      channelId: teamId,
      sessionId: incomingMsg.sessionId,
    });

    const arbiterMember = team.members.find((m) => m.agentId === arbiterId);
    return {
      action: "escalate",
      escalationMessage: escalationMsg as any,
      arbiterMember,
    };
  }

  return { action: "continue" };
}
