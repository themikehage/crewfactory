export interface SessionContext {
  activeChannel?: { id: string; name: string } | null;
  activeTeam?: { id: string; name: string } | null;
  activeAgent?: { id: string; name: string } | null;
  activeProjectName?: string | null;
  activeProjectFriendlyName?: string | null;
}

export interface CreateSessionBody {
  name: string;
  projectName?: string;
  agentId?: string;
  channelId?: string;
  teamId?: string;
}

export function buildCreateSessionBody(
  sessionName: string,
  context: SessionContext
): CreateSessionBody {
  const { activeChannel, activeTeam, activeAgent, activeProjectName } = context;
  return {
    name: sessionName,
    projectName: activeAgent || activeChannel || activeTeam ? undefined : activeProjectName || undefined,
    agentId: activeChannel || activeTeam ? undefined : activeAgent ? activeAgent.id : undefined,
    channelId: activeChannel ? activeChannel.id : undefined,
    teamId: activeTeam ? activeTeam.id : undefined,
  };
}

export function getSessionContextPredicate(
  context: SessionContext
): (session: { projectName?: string; agentId?: string; channelId?: string; teamId?: string; experimentId?: string }) => boolean {
  const { activeChannel, activeTeam, activeAgent, activeProjectName } = context;
  return (session) => {
    if (activeChannel) {
      return session.channelId === activeChannel.id;
    }
    if (activeTeam) {
      return session.teamId === activeTeam.id;
    }
    if (activeAgent) {
      if (activeAgent.id === "lab-architect") {
        return session.agentId === "lab-architect" && !session.experimentId && !session.channelId && !session.teamId;
      }
      return session.agentId === activeAgent.id && !session.channelId && !session.teamId;
    }
    if (activeProjectName) {
      return (
        session.projectName === activeProjectName &&
        !session.agentId &&
        !session.channelId &&
        !session.teamId
      );
    }
    return !session.projectName && !session.agentId && !session.channelId && !session.teamId;
  };
}

export function getSessionPath(sessionId: string, context: SessionContext): string {
  const { activeChannel, activeTeam, activeAgent, activeProjectName } = context;
  let routeContext: ContextPathInput | null = null;
  if (activeChannel) {
    routeContext = { type: "channel", id: activeChannel.id };
  }
  if (activeTeam && !routeContext) {
    routeContext = { type: "team", id: activeTeam.id };
  }
  if (activeAgent && !routeContext) {
    if (activeAgent.id === "lab-architect") {
      return `/laboratory/session/${sessionId}`;
    }
    routeContext = { type: "agent", id: activeAgent.id };
  }
  if (activeProjectName && !routeContext) {
    routeContext = { type: "project", id: activeProjectName };
  }
  return buildSessionPath(routeContext, sessionId);
}

export function getSessionName(context: SessionContext, count?: number): string {
  const { activeChannel, activeTeam, activeAgent, activeProjectName, activeProjectFriendlyName } = context;
  const suffix = count !== undefined ? ` ${count + 1}` : "";

  if (activeChannel) {
    return `#${activeChannel.name} - Session${suffix}`;
  }
  if (activeTeam) {
    return `#${activeTeam.name} - Session${suffix}`;
  }
  if (activeAgent) {
    return `${activeAgent.name} - Session${suffix}`;
  }
  if (activeProjectFriendlyName) {
    return `${activeProjectFriendlyName} - Session${suffix}`;
  }
  if (activeProjectName) {
    return `${activeProjectName} - Session${suffix}`;
  }
  return `Global Session${suffix}`;
}

export interface SessionMeta {
  isReadOnly: boolean;
  isExecution: boolean;
  isSubagent: boolean;
  isDelegation: boolean;
  isLab: boolean;
  isChannelExecution: boolean;
  isTeamExecution: boolean;
}

export function getSessionMeta(sessionId: string | null): SessionMeta {
  if (!sessionId) {
    return {
      isReadOnly: false,
      isExecution: false,
      isSubagent: false,
      isDelegation: false,
      isLab: false,
      isChannelExecution: false,
      isTeamExecution: false,
    };
  }

  const isExecution = sessionId.startsWith("exec_");
  const isSubagent = sessionId.startsWith("sub_");
  const isDelegation = sessionId.startsWith("del_");
  const isLab = sessionId.startsWith("lab_");
  const isChannelExecution = isExecution && sessionId.includes("_channel_");
  const isTeamExecution = isExecution && sessionId.includes("_team_");

  return {
    isReadOnly: isExecution,
    isExecution,
    isSubagent,
    isDelegation,
    isLab,
    isChannelExecution,
    isTeamExecution,
  };
}
import { buildSessionPath, type ContextPathInput } from "@/router/paths";
