import { NegotiationProtocol } from "../core/negotiation/negotiation-protocol";
import { ArbitrationProtocol } from "../core/negotiation/arbitration-protocol";
import { channelStore } from "./channel-store";
import { DivergenceDetector } from "../laboratory/divergence-detector";
import type { Channel, ChannelMessage, ChannelMember } from "shared";
import crypto from "node:crypto";

export interface NegotiationResult {
  action: "continue" | "stop-agreed" | "stop-rejected" | "escalate";
  escalationMessage?: ChannelMessage;
  arbiterMember?: ChannelMember;
}

export function handleNegotiation(
  username: string,
  channelId: string,
  channel: Channel,
  memberAgentId: string,
  incomingMsg: ChannelMessage,
  agentMsg: ChannelMessage,
  agentNameMap: Map<string, string>,
  broadcastFn: (channelId: string, data: any) => void
): NegotiationResult {
  if (!channel.negotiationProtocol) {
    return { action: "continue" };
  }

  const negotiationState = channelStore.getNegotiationState(username, channelId);
  const protocol = new NegotiationProtocol(channel.negotiationProtocol, negotiationState);
  const receiverId = incomingMsg.role === "user" ? "user" : incomingMsg.agentId || "user";
  const senderId = memberAgentId;
  const ingestResult = protocol.ingest(senderId, receiverId, agentMsg.content);

  // If the arbitrator resolved, increment arbitration count
  const updatedState = protocol.getState();
  if (memberAgentId === channel.negotiationProtocol.arbiterAgentId && agentMsg.content.includes("RESOLUTION:")) {
    updatedState._arbitrations = (updatedState._arbitrations || 0) + 1;
  }
  channelStore.saveNegotiationState(username, channelId, updatedState);

  broadcastFn(channelId, {
    type: "channel_negotiation_round",
    channelId,
    sessionId: incomingMsg.sessionId,
    agentId: senderId,
    receiverId,
    rounds: ingestResult.rounds,
    status: protocol.getState()[ingestResult.pairKey]?.status || "open",
  });

  // Divergence Detection Check
  const messages = channelStore.getMessages(username, channelId, 100, incomingMsg.sessionId);
  const allMessages = [...messages, agentMsg];
  const divergence = DivergenceDetector.detect(allMessages);

  if (divergence && channel.negotiationProtocol.arbiterAgentId) {
    const arbiterId = channel.negotiationProtocol.arbiterAgentId;
    const arbiterName = agentNameMap.get(arbiterId) || arbiterId;

    // Broadcast divergence event
    broadcastFn(channelId, {
      type: "channel_negotiation_divergence",
      channelId,
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
    channelStore.saveNegotiationState(username, channelId, updatedStateWithDivergence);

    // Broadcast escalation event
    broadcastFn(channelId, {
      type: "channel_negotiation_escalation",
      channelId,
      sessionId: incomingMsg.sessionId,
      arbiterId,
      arbiterName,
      rounds: ingestResult.rounds,
      reason: divergence.reason
    });

    const agentName = agentNameMap.get(senderId) || senderId;
    const targetName = receiverId === "user" ? "user" : agentNameMap.get(receiverId) || receiverId;
    const escalationMsg: ChannelMessage = {
      id: crypto.randomUUID(),
      channelId,
      sessionId: incomingMsg.sessionId,
      role: "system",
      content: `[DIVERGENCIA DETECTADA] ${divergence.reason}\n\n@${arbiterName}, emite una resolución formal vinculante para resolver este bloqueo.`,
      createdAt: new Date().toISOString(),
    };

    const arbiterMember = channel.members.find((m) => m.agentId === arbiterId);
    return {
      action: "escalate",
      escalationMessage: escalationMsg,
      arbiterMember,
    };
  }

  if (ingestResult.matched === "agreed") {
    broadcastFn(channelId, {
      type: "channel_negotiation_agreement",
      channelId,
      sessionId: incomingMsg.sessionId,
      agentId: senderId,
      receiverId,
      content: agentMsg.content,
    });
    return { action: "stop-agreed" };
  }

  if (ingestResult.matched === "rejected") {
    broadcastFn(channelId, {
      type: "channel_negotiation_rejected",
      channelId,
      sessionId: incomingMsg.sessionId,
      agentId: senderId,
      receiverId,
    });
    return { action: "stop-rejected" };
  }

  if (ingestResult.shouldEscalate && channel.negotiationProtocol.arbiterAgentId) {
    const arbiterId = channel.negotiationProtocol.arbiterAgentId;
    const arbiterName = agentNameMap.get(arbiterId) || arbiterId;

    broadcastFn(channelId, {
      type: "channel_negotiation_escalation",
      channelId,
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
      channelId,
      sessionId: incomingMsg.sessionId,
    });

    const arbiterMember = channel.members.find((m) => m.agentId === arbiterId);
    return {
      action: "escalate",
      escalationMessage: escalationMsg,
      arbiterMember,
    };
  }

  return { action: "continue" };
}

