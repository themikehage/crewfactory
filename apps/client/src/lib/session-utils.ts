export interface SessionContext {
  activeChannel?: { id: string; name: string } | null;
  activeAgent?: { id: string; name: string } | null;
  activeProjectName?: string | null;
  activeProjectFriendlyName?: string | null;
}

export interface CreateSessionBody {
  name: string;
  projectName?: string;
  agentId?: string;
  channelId?: string;
}

export function buildCreateSessionBody(
  sessionName: string,
  context: SessionContext
): CreateSessionBody {
  const { activeChannel, activeAgent, activeProjectName } = context;
  return {
    name: sessionName,
    projectName: activeAgent || activeChannel ? undefined : activeProjectName || undefined,
    agentId: activeChannel ? undefined : activeAgent ? activeAgent.id : undefined,
    channelId: activeChannel ? activeChannel.id : undefined,
  };
}

export function getSessionContextPredicate(
  context: SessionContext
): (session: { projectName?: string; agentId?: string; channelId?: string; experimentId?: string }) => boolean {
  const { activeChannel, activeAgent, activeProjectName } = context;
  return (session) => {
    if (activeChannel) {
      return session.channelId === activeChannel.id;
    }
    if (activeAgent) {
      if (activeAgent.id === "lab-architect") {
        return session.agentId === "lab-architect" && !session.experimentId && !session.channelId;
      }
      return session.agentId === activeAgent.id && !session.channelId;
    }
    if (activeProjectName) {
      return (
        session.projectName === activeProjectName &&
        !session.agentId &&
        !session.channelId
      );
    }
    return !session.projectName && !session.agentId && !session.channelId;
  };
}

export function getSessionPath(sessionId: string, context: SessionContext): string {
  const { activeChannel, activeAgent, activeProjectName } = context;
  if (activeChannel) {
    return `/channels/${activeChannel.id}/session/${sessionId}`;
  }
  if (activeAgent) {
    if (activeAgent.id === "lab-architect") {
      return `/laboratory/session/${sessionId}`;
    }
    return `/agents/${activeAgent.id}/session/${sessionId}`;
  }
  if (activeProjectName) {
    return `/projects/${activeProjectName}/session/${sessionId}`;
  }
  return `/session/${sessionId}`;
}

export function getSessionName(context: SessionContext, count?: number): string {
  const { activeChannel, activeAgent, activeProjectName, activeProjectFriendlyName } = context;
  const suffix = count !== undefined ? ` ${count + 1}` : "";

  if (activeChannel) {
    return `#${activeChannel.name} - Session${suffix}`;
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
    };
  }

  const isExecution = sessionId.startsWith("exec_");
  const isSubagent = sessionId.startsWith("sub_");
  const isDelegation = sessionId.startsWith("del_");
  const isLab = sessionId.startsWith("lab_");
  const isChannelExecution = isExecution && sessionId.includes("_channel_");

  return {
    isReadOnly: isExecution,
    isExecution,
    isSubagent,
    isDelegation,
    isLab,
    isChannelExecution,
  };
}
