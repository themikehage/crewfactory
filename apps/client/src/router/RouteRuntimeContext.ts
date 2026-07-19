import { createContext, createElement, useContext, type ReactNode } from "react";
import type { Route } from "@/hooks/useRouter";
import type { useLaboratoryController } from "@/hooks/useLaboratoryController";
import type { ActiveAgent, ActiveNamedContext } from "@/hooks/useWorkspaceContext";

interface RouteRuntimeValue {
  route: Route;
  navigate: (path: string) => void;
  activeProjectId: string | null;
  activeAgent: ActiveAgent | null;
  activeChannel: ActiveNamedContext | null;
  activeTeam: ActiveNamedContext | null;
  selectProject: (projectId: string | null, projectName: string | null) => void;
  selectAgent: (agent: ActiveAgent | null) => void;
  selectChannel: (channel: ActiveNamedContext | null) => void;
  laboratory: ReturnType<typeof useLaboratoryController>;
}

const RouteRuntimeContext = createContext<RouteRuntimeValue | null>(null);

export function RouteRuntimeProvider({ value, children }: { value: RouteRuntimeValue; children: ReactNode }) {
  return createElement(RouteRuntimeContext.Provider, { value }, children);
}

export function useRouteRuntime(): RouteRuntimeValue {
  const context = useContext(RouteRuntimeContext);
  if (!context) throw new Error("useRouteRuntime must be used within RouteRuntimeProvider");
  return context;
}
