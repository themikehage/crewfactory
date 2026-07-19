import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { matchPath, useLocation, useNavigate } from "react-router-dom";
import { buildContextPath } from "@/router/paths";

export interface ActiveAgent {
  id: string;
  name: string;
  avatarUrl?: string;
}

export interface ActiveNamedContext {
  id: string;
  name: string;
}

interface WorkspaceContextValue {
  activeProjectId: string | null;
  activeProjectFriendlyName: string | null;
  activeAgent: ActiveAgent | null;
  activeChannel: ActiveNamedContext | null;
  activeTeam: ActiveNamedContext | null;
  selectProject: (projectId: string | null, projectName: string | null) => void;
  selectAgent: (agent: ActiveAgent | null) => void;
  selectChannel: (channel: ActiveNamedContext | null) => void;
  selectTeam: (team: ActiveNamedContext | null) => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

function readStoredValue<T>(key: string): T | null {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) as T : null;
  } catch {
    return null;
  }
}

function getRouteContext(pathname: string) {
  const projectId = matchPath("/projects/:projectId/*", pathname)?.params.projectId ?? null;
  if (projectId) return { type: "project" as const, id: projectId };
  const agentId = matchPath("/agents/:agentId/*", pathname)?.params.agentId ?? null;
  if (agentId) return { type: "agent" as const, id: agentId };
  const channelId = matchPath("/channels/:channelId/*", pathname)?.params.channelId ?? null;
  if (channelId) return { type: "channel" as const, id: channelId };
  const teamId = matchPath("/teams/:teamId/*", pathname)?.params.teamId ?? null;
  return teamId ? { type: "team" as const, id: teamId } : null;
}

function useWorkspaceContextState(): WorkspaceContextValue {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const routeContext = useMemo(() => getRouteContext(pathname), [pathname]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(() => localStorage.getItem("active-project-id"));
  const [activeProjectFriendlyName, setActiveProjectFriendlyName] = useState<string | null>(() => localStorage.getItem("active-project-name"));
  const [activeAgent, setActiveAgent] = useState<ActiveAgent | null>(() => readStoredValue<ActiveAgent>("active-agent"));
  const [activeChannel, setActiveChannel] = useState<ActiveNamedContext | null>(() => readStoredValue<ActiveNamedContext>("active-channel"));
  const [activeTeam, setActiveTeam] = useState<ActiveNamedContext | null>(() => readStoredValue<ActiveNamedContext>("active-team"));

  const clearPersistedContexts = useCallback(() => {
    localStorage.removeItem("active-project-id");
    localStorage.removeItem("active-project-name");
    localStorage.removeItem("active-agent");
    localStorage.removeItem("active-channel");
    localStorage.removeItem("active-team");
  }, []);

  const clearState = useCallback(() => {
    setActiveProjectId(null);
    setActiveProjectFriendlyName(null);
    setActiveAgent(null);
    setActiveChannel(null);
    setActiveTeam(null);
  }, []);

  const navigateIfNeeded = useCallback((path: string) => {
    if (pathname !== path) navigate(path);
  }, [navigate, pathname]);

  const selectProject = useCallback((projectId: string | null, projectName: string | null) => {
    if (!projectId) {
      clearPersistedContexts();
      clearState();
      localStorage.setItem("has-context", "false");
      navigateIfNeeded("/");
      return;
    }

    clearPersistedContexts();
    localStorage.setItem("active-project-id", projectId);
    localStorage.setItem("active-project-name", projectName || projectId);
    localStorage.setItem("has-context", "true");
    if (activeProjectId !== projectId) setActiveProjectId(projectId);
    if (activeProjectFriendlyName !== (projectName || projectId)) setActiveProjectFriendlyName(projectName || projectId);
    if (activeAgent) setActiveAgent(null);
    if (activeChannel) setActiveChannel(null);
    if (activeTeam) setActiveTeam(null);
    navigateIfNeeded(buildContextPath({ type: "project", id: projectId }));
  }, [activeAgent, activeChannel, activeProjectFriendlyName, activeProjectId, activeTeam, clearPersistedContexts, clearState, navigateIfNeeded]);

  const selectAgent = useCallback((agent: ActiveAgent | null) => {
    if (!agent) {
      clearPersistedContexts();
      clearState();
      localStorage.setItem("has-context", "false");
      navigateIfNeeded("/");
      return;
    }

    clearPersistedContexts();
    localStorage.setItem("active-agent", JSON.stringify(agent));
    localStorage.setItem("has-context", "true");
    if (activeProjectId) setActiveProjectId(null);
    if (activeProjectFriendlyName) setActiveProjectFriendlyName(null);
    if (activeAgent?.id !== agent.id || activeAgent.name !== agent.name || activeAgent.avatarUrl !== agent.avatarUrl) setActiveAgent(agent);
    if (activeChannel) setActiveChannel(null);
    if (activeTeam) setActiveTeam(null);
    navigateIfNeeded(buildContextPath({ type: "agent", id: agent.id }));
  }, [activeAgent, activeChannel, activeProjectFriendlyName, activeProjectId, activeTeam, clearPersistedContexts, clearState, navigateIfNeeded]);

  const selectChannel = useCallback((channel: ActiveNamedContext | null) => {
    if (!channel) {
      clearPersistedContexts();
      clearState();
      localStorage.setItem("has-context", "false");
      navigateIfNeeded("/");
      return;
    }

    clearPersistedContexts();
    localStorage.setItem("active-channel", JSON.stringify(channel));
    localStorage.setItem("has-context", "true");
    if (activeProjectId) setActiveProjectId(null);
    if (activeProjectFriendlyName) setActiveProjectFriendlyName(null);
    if (activeAgent) setActiveAgent(null);
    if (activeChannel?.id !== channel.id || activeChannel.name !== channel.name) setActiveChannel(channel);
    if (activeTeam) setActiveTeam(null);
    navigateIfNeeded(buildContextPath({ type: "channel", id: channel.id }));
  }, [activeAgent, activeChannel, activeProjectFriendlyName, activeProjectId, activeTeam, clearPersistedContexts, clearState, navigateIfNeeded]);

  const selectTeam = useCallback((team: ActiveNamedContext | null) => {
    if (!team) {
      clearPersistedContexts();
      clearState();
      localStorage.setItem("has-context", "false");
      navigateIfNeeded("/");
      return;
    }

    clearPersistedContexts();
    localStorage.setItem("active-team", JSON.stringify(team));
    localStorage.setItem("has-context", "true");
    if (activeProjectId) setActiveProjectId(null);
    if (activeProjectFriendlyName) setActiveProjectFriendlyName(null);
    if (activeAgent) setActiveAgent(null);
    if (activeChannel) setActiveChannel(null);
    if (activeTeam?.id !== team.id || activeTeam.name !== team.name) setActiveTeam(team);
    navigateIfNeeded(buildContextPath({ type: "team", id: team.id }));
  }, [activeAgent, activeChannel, activeProjectFriendlyName, activeProjectId, activeTeam, clearPersistedContexts, clearState, navigateIfNeeded]);

  useEffect(() => {
    const routeProject = routeContext?.type === "project" ? routeContext.id : null;
    const routeAgent = routeContext?.type === "agent" ? routeContext.id : null;
    const routeChannel = routeContext?.type === "channel" ? routeContext.id : null;
    const routeTeam = routeContext?.type === "team" ? routeContext.id : null;

    if (routeProject && routeProject !== activeProjectId) {
      clearPersistedContexts();
      localStorage.setItem("active-project-id", routeProject);
      localStorage.setItem("active-project-name", routeProject);
      localStorage.setItem("has-context", "true");
      setActiveProjectId(routeProject);
      setActiveProjectFriendlyName(routeProject);
      setActiveAgent(null);
      setActiveChannel(null);
      setActiveTeam(null);
      return;
    }

    if (routeAgent && routeAgent !== activeAgent?.id) {
      const agent = { id: routeAgent, name: routeAgent };
      clearPersistedContexts();
      localStorage.setItem("active-agent", JSON.stringify(agent));
      localStorage.setItem("has-context", "true");
      setActiveProjectId(null);
      setActiveProjectFriendlyName(null);
      setActiveAgent(agent);
      setActiveChannel(null);
      setActiveTeam(null);
      return;
    }

    if (routeChannel && routeChannel !== activeChannel?.id) {
      const channel = { id: routeChannel, name: routeChannel };
      clearPersistedContexts();
      localStorage.setItem("active-channel", JSON.stringify(channel));
      localStorage.setItem("has-context", "true");
      setActiveProjectId(null);
      setActiveProjectFriendlyName(null);
      setActiveAgent(null);
      setActiveChannel(channel);
      setActiveTeam(null);
      return;
    }

    if (routeTeam && routeTeam !== activeTeam?.id) {
      const team = { id: routeTeam, name: routeTeam };
      clearPersistedContexts();
      localStorage.setItem("active-team", JSON.stringify(team));
      localStorage.setItem("has-context", "true");
      setActiveProjectId(null);
      setActiveProjectFriendlyName(null);
      setActiveAgent(null);
      setActiveChannel(null);
      setActiveTeam(team);
    }
  }, [activeAgent?.id, activeChannel?.id, activeProjectId, activeTeam?.id, clearPersistedContexts, routeContext]);

  return {
    activeProjectId,
    activeProjectFriendlyName,
    activeAgent,
    activeChannel,
    activeTeam,
    selectProject,
    selectAgent,
    selectChannel,
    selectTeam,
  };
}

interface WorkspaceContextProviderProps {
  children: ReactNode;
}

export function WorkspaceContextProvider({ children }: WorkspaceContextProviderProps) {
  const value = useWorkspaceContextState();
  return createElement(WorkspaceContext.Provider, { value }, children);
}

export function useWorkspaceContext(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error("useWorkspaceContext must be used within WorkspaceContextProvider");
  }
  return context;
}
