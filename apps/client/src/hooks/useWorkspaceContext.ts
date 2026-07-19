import { createContext, createElement, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
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

function useWorkspaceContextState(): WorkspaceContextValue {
  const navigate = useNavigate();
  const { projectId, agentId, channelId, teamId } = useParams();
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

  const selectProject = useCallback((projectId: string | null, projectName: string | null) => {
    if (!projectId) {
      clearPersistedContexts();
      clearState();
      localStorage.setItem("has-context", "false");
      navigate("/");
      return;
    }

    clearPersistedContexts();
    localStorage.setItem("active-project-id", projectId);
    localStorage.setItem("active-project-name", projectName || projectId);
    localStorage.setItem("has-context", "true");
    setActiveProjectId(projectId);
    setActiveProjectFriendlyName(projectName || projectId);
    setActiveAgent(null);
    setActiveChannel(null);
    setActiveTeam(null);
    navigate(buildContextPath({ type: "project", id: projectId }));
  }, [clearPersistedContexts, clearState, navigate]);

  const selectAgent = useCallback((agent: ActiveAgent | null) => {
    if (!agent) {
      clearPersistedContexts();
      clearState();
      localStorage.setItem("has-context", "false");
      navigate("/");
      return;
    }

    clearPersistedContexts();
    localStorage.setItem("active-agent", JSON.stringify(agent));
    localStorage.setItem("has-context", "true");
    setActiveProjectId(null);
    setActiveProjectFriendlyName(null);
    setActiveAgent(agent);
    setActiveChannel(null);
    setActiveTeam(null);
    navigate(buildContextPath({ type: "agent", id: agent.id }));
  }, [clearPersistedContexts, clearState, navigate]);

  const selectChannel = useCallback((channel: ActiveNamedContext | null) => {
    if (!channel) {
      clearPersistedContexts();
      clearState();
      localStorage.setItem("has-context", "false");
      navigate("/");
      return;
    }

    clearPersistedContexts();
    localStorage.setItem("active-channel", JSON.stringify(channel));
    localStorage.setItem("has-context", "true");
    setActiveProjectId(null);
    setActiveProjectFriendlyName(null);
    setActiveAgent(null);
    setActiveChannel(channel);
    setActiveTeam(null);
    navigate(buildContextPath({ type: "channel", id: channel.id }));
  }, [clearPersistedContexts, clearState, navigate]);

  const selectTeam = useCallback((team: ActiveNamedContext | null) => {
    if (!team) {
      clearPersistedContexts();
      clearState();
      localStorage.setItem("has-context", "false");
      navigate("/");
      return;
    }

    clearPersistedContexts();
    localStorage.setItem("active-team", JSON.stringify(team));
    localStorage.setItem("has-context", "true");
    setActiveProjectId(null);
    setActiveProjectFriendlyName(null);
    setActiveAgent(null);
    setActiveChannel(null);
    setActiveTeam(team);
    navigate(buildContextPath({ type: "team", id: team.id }));
  }, [clearPersistedContexts, clearState, navigate]);

  useEffect(() => {
    const routeProject = projectId ?? null;
    const routeAgent = agentId ?? null;
    const routeChannel = channelId ?? null;
    const routeTeam = teamId ?? null;

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
  }, [activeAgent?.id, activeChannel?.id, activeProjectId, activeTeam?.id, agentId, channelId, clearPersistedContexts, projectId, teamId]);

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
