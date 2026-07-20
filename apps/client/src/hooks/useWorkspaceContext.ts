import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useReducer, type ReactNode } from "react";
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
  avatarUrl?: string;
}

interface WorkspaceContextValue {
  activeProjectId: string | null;
  activeProjectFriendlyName: string | null;
  activeAgent: ActiveAgent | null;
  activeTeam: ActiveNamedContext | null;
  selectProject: (projectId: string | null, projectName: string | null) => void;
  selectAgent: (agent: ActiveAgent | null) => void;
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
  const teamId = matchPath("/teams/:teamId/*", pathname)?.params.teamId ?? null;
  return teamId ? { type: "team" as const, id: teamId } : null;
}

interface WorkspaceState {
  activeProjectId: string | null;
  activeProjectFriendlyName: string | null;
  activeAgent: ActiveAgent | null;
  activeTeam: ActiveNamedContext | null;
}

type WorkspaceAction =
  | { type: "SELECT_PROJECT"; payload: { id: string | null; name: string | null } }
  | { type: "SELECT_AGENT"; payload: ActiveAgent | null }
  | { type: "SELECT_TEAM"; payload: ActiveNamedContext | null }
  | { type: "CLEAR" };

const initialState: WorkspaceState = {
  activeProjectId: null,
  activeProjectFriendlyName: null,
  activeAgent: null,
  activeTeam: null,
};

function workspaceReducer(state: WorkspaceState, action: WorkspaceAction): WorkspaceState {
  switch (action.type) {
    case "SELECT_PROJECT":
      if (!action.payload.id) {
        return initialState;
      }
      return {
        ...initialState,
        activeProjectId: action.payload.id,
        activeProjectFriendlyName: action.payload.name || action.payload.id,
      };
    case "SELECT_AGENT":
      if (!action.payload) {
        return initialState;
      }
      return {
        ...initialState,
        activeAgent: action.payload,
      };
    case "SELECT_TEAM":
      if (!action.payload) {
        return initialState;
      }
      return {
        ...initialState,
        activeTeam: action.payload,
      };
    case "CLEAR":
      return initialState;
    default:
      return state;
  }
}

function useWorkspaceContextState(): WorkspaceContextValue {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const routeContext = useMemo(() => getRouteContext(pathname), [pathname]);

  const [state, dispatch] = useReducer(workspaceReducer, undefined, () => {
    const currentRoute = getRouteContext(pathname);
    if (currentRoute) {
      switch (currentRoute.type) {
        case "project": {
          const storedId = localStorage.getItem("active-project-id");
          const storedName = localStorage.getItem("active-project-name");
          const friendlyName = (storedId === currentRoute.id && storedName) ? storedName : currentRoute.id;
          return {
            ...initialState,
            activeProjectId: currentRoute.id,
            activeProjectFriendlyName: friendlyName,
          };
        }
        case "agent": {
          const storedAgent = readStoredValue<ActiveAgent>("active-agent");
          const agent = (storedAgent?.id === currentRoute.id) ? storedAgent : { id: currentRoute.id, name: currentRoute.id };
          return {
            ...initialState,
            activeAgent: agent,
          };
        }
        case "team": {
          const storedTeam = readStoredValue<ActiveNamedContext>("active-team");
          const team = (storedTeam?.id === currentRoute.id) ? storedTeam : { id: currentRoute.id, name: currentRoute.id };
          return {
            ...initialState,
            activeTeam: team,
          };
        }
      }
    }

    const activeProjectId = localStorage.getItem("active-project-id");
    const activeProjectFriendlyName = localStorage.getItem("active-project-name");
    const activeAgent = readStoredValue<ActiveAgent>("active-agent");
    const activeTeam = readStoredValue<ActiveNamedContext>("active-team");

    if (activeProjectId) {
      return { ...initialState, activeProjectId, activeProjectFriendlyName: activeProjectFriendlyName || activeProjectId };
    }
    if (activeAgent) {
      return { ...initialState, activeAgent };
    }
    if (activeTeam) {
      return { ...initialState, activeTeam };
    }

    return initialState;
  });

  useEffect(() => {
    localStorage.removeItem("active-project-id");
    localStorage.removeItem("active-project-name");
    localStorage.removeItem("active-agent");
    localStorage.removeItem("active-team");

    if (state.activeProjectId) {
      localStorage.setItem("active-project-id", state.activeProjectId);
      if (state.activeProjectFriendlyName) {
        localStorage.setItem("active-project-name", state.activeProjectFriendlyName);
      }
      localStorage.setItem("has-context", "true");
    } else if (state.activeAgent) {
      localStorage.setItem("active-agent", JSON.stringify(state.activeAgent));
      localStorage.setItem("has-context", "true");
    } else if (state.activeTeam) {
      localStorage.setItem("active-team", JSON.stringify(state.activeTeam));
      localStorage.setItem("has-context", "true");
    } else {
      localStorage.setItem("has-context", "false");
    }
  }, [state]);

  useEffect(() => {
    if (!routeContext) {
      if (pathname === "/") {
        dispatch({ type: "CLEAR" });
      }
      return;
    }

    switch (routeContext.type) {
      case "project":
        if (state.activeProjectId !== routeContext.id) {
          const storedId = localStorage.getItem("active-project-id");
          const storedName = localStorage.getItem("active-project-name");
          const friendlyName = (storedId === routeContext.id && storedName) ? storedName : routeContext.id;
          dispatch({ type: "SELECT_PROJECT", payload: { id: routeContext.id, name: friendlyName } });
        }
        break;
      case "agent":
        if (state.activeAgent?.id !== routeContext.id) {
          const storedAgent = readStoredValue<ActiveAgent>("active-agent");
          const agent = (storedAgent?.id === routeContext.id) ? storedAgent : { id: routeContext.id, name: routeContext.id };
          dispatch({ type: "SELECT_AGENT", payload: agent });
        }
        break;
      case "team":
        if (state.activeTeam?.id !== routeContext.id) {
          const storedTeam = readStoredValue<ActiveNamedContext>("active-team");
          const team = (storedTeam?.id === routeContext.id) ? storedTeam : { id: routeContext.id, name: routeContext.id };
          dispatch({ type: "SELECT_TEAM", payload: team });
        }
        break;
    }
  }, [routeContext, pathname, state.activeProjectId, state.activeAgent?.id, state.activeTeam?.id]);

  useEffect(() => {
    const handleUpdate = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      if (detail?.type === "project" && state.activeProjectId) {
        const storedName = localStorage.getItem("active-project-name");
        if (storedName && storedName !== state.activeProjectFriendlyName) {
          dispatch({ type: "SELECT_PROJECT", payload: { id: state.activeProjectId, name: storedName } });
        }
      }
    };
    window.addEventListener("entity-updated", handleUpdate);
    return () => window.removeEventListener("entity-updated", handleUpdate);
  }, [state.activeProjectId, state.activeProjectFriendlyName]);

  const navigateIfNeeded = useCallback((path: string) => {
    if (pathname !== path) navigate(path);
  }, [navigate, pathname]);

  const selectProject = useCallback((projectId: string | null, projectName: string | null) => {
    if (!projectId) {
      dispatch({ type: "CLEAR" });
      navigateIfNeeded("/");
      return;
    }
    localStorage.setItem("active-project-id", projectId);
    if (projectName) {
      localStorage.setItem("active-project-name", projectName);
    }
    navigateIfNeeded(buildContextPath({ type: "project", id: projectId }));
  }, [navigateIfNeeded]);

  const selectAgent = useCallback((agent: ActiveAgent | null) => {
    if (!agent) {
      dispatch({ type: "CLEAR" });
      navigateIfNeeded("/");
      return;
    }
    localStorage.setItem("active-agent", JSON.stringify(agent));
    navigateIfNeeded(buildContextPath({ type: "agent", id: agent.id }));
  }, [navigateIfNeeded]);

  const selectTeam = useCallback((team: ActiveNamedContext | null) => {
    if (!team) {
      dispatch({ type: "CLEAR" });
      navigateIfNeeded("/");
      return;
    }
    localStorage.setItem("active-team", JSON.stringify(team));
    navigateIfNeeded(buildContextPath({ type: "team", id: team.id }));
  }, [navigateIfNeeded]);

  return {
    activeProjectId: state.activeProjectId,
    activeProjectFriendlyName: state.activeProjectFriendlyName,
    activeAgent: state.activeAgent,
    activeTeam: state.activeTeam,
    selectProject,
    selectAgent,
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
