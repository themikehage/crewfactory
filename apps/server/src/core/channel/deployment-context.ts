import type { Channel } from "shared";

export interface DeploymentMember {
  agentId: string;
  agentName: string;
  role: string;
  replyMode: string;
}

export interface DeploymentContext {
  mode: "broadcast" | "targeted" | "solo";
  channelId?: string;
  agentRole?: string;
  members?: DeploymentMember[];
  negotiationProtocol?: boolean;
  isArbiter?: boolean;
  selfReplyMode?: string;
  leaderName?: string;
}

export function buildDeploymentContext(
  channel: Channel,
  agentId: string,
  agentNameMap: Map<string, string>
): DeploymentContext {
  const isBroadcast = channel.members.some((m) => m.replyMode === "broadcast");
  const hasLeader = channel.members.some((m) => m.role === "lead");
  const selfMember = channel.members.find((m) => m.agentId === agentId);

  const arbiterAgentId = typeof channel.negotiationProtocol === "object"
    ? channel.negotiationProtocol?.arbiterAgentId
    : undefined;

  const isArbiter = arbiterAgentId
    ? selfMember?.agentId === arbiterAgentId
    : selfMember?.role === "lead";

  const leaderMember = channel.members.find((m) => m.role === "lead");
  const leaderName = leaderMember ? (agentNameMap.get(leaderMember.agentId) || leaderMember.agentId) : undefined;

  return {
    mode: isBroadcast ? "broadcast" : hasLeader ? "targeted" : "broadcast",
    channelId: channel.id,
    agentRole: selfMember?.role || "member",
    members: channel.members.map((m) => ({
      agentId: m.agentId,
      agentName: agentNameMap.get(m.agentId) || m.agentId,
      role: m.role || "member",
      replyMode: m.replyMode || "broadcast",
    })),
    negotiationProtocol: !!channel.negotiationProtocol,
    isArbiter,
    selfReplyMode: selfMember?.replyMode || "broadcast",
    leaderName,
  };
}
