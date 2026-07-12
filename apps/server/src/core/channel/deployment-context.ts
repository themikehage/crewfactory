import type { Channel } from "shared";

export interface DeploymentMember {
  agentId: string;
  agentName: string;
  role: string;
}

export interface DeploymentContext {
  mode: "broadcast" | "targeted" | "solo";
  channelId?: string;
  agentRole?: string;
  members?: DeploymentMember[];
  negotiationProtocol?: boolean;
  isArbiter?: boolean;
}

export function buildDeploymentContext(
  channel: Channel,
  agentId: string,
  agentNameMap: Map<string, string>
): DeploymentContext {
  const isBroadcast = channel.members.some((m) => m.replyMode === "broadcast");
  const hasLeader = channel.members.some((m) => m.role === "lead");
  const selfMember = channel.members.find((m) => m.agentId === agentId);
  const isArbiter = selfMember?.role === "lead";

  return {
    mode: isBroadcast ? "broadcast" : hasLeader ? "targeted" : "broadcast",
    channelId: channel.id,
    agentRole: selfMember?.role || "member",
    members: channel.members.map((m) => ({
      agentId: m.agentId,
      agentName: agentNameMap.get(m.agentId) || m.agentId,
      role: m.role || "member",
    })),
    negotiationProtocol: !!channel.negotiationProtocol,
    isArbiter,
  };
}
