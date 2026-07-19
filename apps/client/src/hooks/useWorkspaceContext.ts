import { useCallback, useEffect, useState } from "react";
import type { Route } from "@/hooks/useRouter";

export interface ActiveAgent {
  id: string;
  name: string;
  avatarUrl?: string;
}

export interface ActiveNamedContext {
  id: string;
  name: string;
}

interface UseWorkspaceContextOptions {
  route: Route;
  navigate: (path: string) => void;
}

function readStoredValue<T>(key: string): T | null {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) as T : null;
  } catch {
    return null;
  }
}

export function useWorkspaceContext({ route, navigate }: UseWorkspaceContextOptions) {
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
    navigate(`/projects/${projectId}/chat`);
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
    navigate(`/agents/${agent.id}/chat`);
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
    navigate(`/channels/${channel.id}/chat`);
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
    navigate(`/teams/${team.id}/chat`);
  }, [clearPersistedContexts, clearState, navigate]);

  useEffect(() => {
    const routeProject = "projectName" in route ? route.projectName : null;
    const routeAgent = "agentId" in route ? route.agentId : null;
    const routeChannel = "channelId" in route ? route.channelId : null;
    const routeTeam = "teamId" in route ? route.teamId : null;

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
  }, [activeAgent?.id, activeChannel?.id, activeProjectId, activeTeam?.id, clearPersistedContexts, route]);

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
