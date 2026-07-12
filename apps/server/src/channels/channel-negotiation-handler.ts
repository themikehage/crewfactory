import { NegotiationProtocol } from "../core/negotiation/negotiation-protocol";
import { ArbitrationProtocol } from "../core/negotiation/arbitration-protocol";
import { channelStore } from "./channel-store";
import type { Channel, ChannelMessage, ChannelMember } from "shared";

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

  channelStore.saveNegotiationState(username, channelId, protocol.getState());

  broadcastFn(channelId, {
    type: "channel_negotiation_round",
    channelId,
    sessionId: incomingMsg.sessionId,
    agentId: senderId,
    receiverId,
    rounds: ingestResult.rounds,
    status: protocol.getState()[ingestResult.pairKey]?.status || "open",
  });

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
