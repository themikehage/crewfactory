import { buildSessionPath, type ContextPathInput } from "@/router/paths";

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

type ResolvedContext =
  | { type: "channel"; id: string; name: string }
  | { type: "team"; id: string; name: string }
  | { type: "agent"; id: string; name: string }
  | { type: "project"; id: string; name: string; friendlyName: string }
  | { type: "global" };

function resolveContext(context: SessionContext): ResolvedContext {
  const { activeChannel, activeTeam, activeAgent, activeProjectName, activeProjectFriendlyName } = context;
  if (activeChannel) {
    return { type: "channel", id: activeChannel.id, name: activeChannel.name };
  }
  if (activeTeam) {
    return { type: "team", id: activeTeam.id, name: activeTeam.name };
  }
  if (activeAgent) {
    return { type: "agent", id: activeAgent.id, name: activeAgent.name };
  }
  if (activeProjectName) {
    return {
      type: "project",
      id: activeProjectName,
      name: activeProjectName,
      friendlyName: activeProjectFriendlyName || activeProjectName,
    };
  }
  return { type: "global" };
}

export function buildCreateSessionBody(
  sessionName: string,
  context: SessionContext
): CreateSessionBody {
  const resolved = resolveContext(context);
  switch (resolved.type) {
    case "channel":
      return { name: sessionName, channelId: resolved.id };
    case "team":
      return { name: sessionName, teamId: resolved.id };
    case "agent":
      return { name: sessionName, agentId: resolved.id };
    case "project":
      return { name: sessionName, projectName: resolved.id };
    case "global":
      return { name: sessionName };
  }
}

export function getSessionContextPredicate(
  context: SessionContext
): (session: { projectName?: string; agentId?: string; channelId?: string; teamId?: string; experimentId?: string }) => boolean {
  const resolved = resolveContext(context);
  return (session) => {
    switch (resolved.type) {
      case "channel":
        return session.channelId === resolved.id;
      case "team":
        return session.teamId === resolved.id;
      case "agent":
        if (resolved.id === "lab-architect") {
          return session.agentId === "lab-architect" && !session.experimentId && !session.channelId && !session.teamId;
        }
        return session.agentId === resolved.id && !session.channelId && !session.teamId;
      case "project":
        return (
          session.projectName === resolved.id &&
          !session.agentId &&
          !session.channelId &&
          !session.teamId
        );
      case "global":
        return !session.projectName && !session.agentId && !session.channelId && !session.teamId;
    }
  };
}

export function getSessionPath(sessionId: string, context: SessionContext): string {
  const resolved = resolveContext(context);
  if (resolved.type === "agent" && resolved.id === "lab-architect") {
    return `/laboratory/session/${sessionId}`;
  }

  let routeContext: ContextPathInput | null = null;
  switch (resolved.type) {
    case "channel":
      routeContext = { type: "channel", id: resolved.id };
      break;
    case "team":
      routeContext = { type: "team", id: resolved.id };
      break;
    case "agent":
      routeContext = { type: "agent", id: resolved.id };
      break;
    case "project":
      routeContext = { type: "project", id: resolved.id };
      break;
    case "global":
      routeContext = null;
      break;
  }
  return buildSessionPath(routeContext, sessionId);
}

export function getSessionName(context: SessionContext, count?: number): string {
  const resolved = resolveContext(context);
  const suffix = count !== undefined ? ` ${count + 1}` : "";

  switch (resolved.type) {
    case "channel":
      return `#${resolved.name} - Session${suffix}`;
    case "team":
      return `#${resolved.name} - Session${suffix}`;
    case "agent":
      return `${resolved.name} - Session${suffix}`;
    case "project":
      return `${resolved.friendlyName} - Session${suffix}`;
    case "global":
      return `Global Session${suffix}`;
  }
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
