import { useState, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { getSessionPath as resolveSessionPath } from "@/lib/session-utils";

interface UseSessionActionsProps {
  activeProjectId?: string | null;
  activeProjectFriendlyName?: string | null;
  activeAgent: { id: string; name: string } | null;
  activeTeam?: { id: string; name: string } | null;
  onNavigate: (path: string) => void;
  setSidebarOpen?: (open: boolean) => void;
}

export function useSessionActions({
  activeProjectId,
  activeProjectFriendlyName = null,
  activeAgent,
  activeTeam = null,
  onNavigate,
  setSidebarOpen,
}: UseSessionActionsProps) {
  const [quickCreating, setQuickCreating] = useState(false);

  const getSessionPath = useCallback(
    (id: string) => {
      return resolveSessionPath(id, {
        activeTeam,
        activeAgent,
        activeProjectName: activeProjectId,
        activeProjectFriendlyName,
      });
    },
    [activeTeam, activeAgent, activeProjectId, activeProjectFriendlyName]
  );

  const handleSelectSession = useCallback(
    (id: string) => {
      if (id) {
        onNavigate(getSessionPath(id));
      } else {
        let basePath = "";
        if (activeTeam) basePath = `/teams/${activeTeam.id}/chat`;
        else if (activeAgent) {
          if (activeAgent.id === "lab-architect") {
            basePath = "/laboratory";
          } else {
            basePath = `/agents/${activeAgent.id}/chat`;
          }
        }
        else if (activeProjectId) basePath = `/projects/${activeProjectId}/chat`;
        onNavigate(basePath || "/");
      }
      setSidebarOpen?.(false);
    },
    [onNavigate, getSessionPath, activeTeam?.id, activeAgent?.id, activeProjectId, setSidebarOpen]
  );

  const handleNewSession = useCallback(
    (id: string) => {
      onNavigate(getSessionPath(id));
      setSidebarOpen?.(false);
    },
    [onNavigate, getSessionPath, setSidebarOpen]
  );

  const handleQuickCreate = useCallback(async () => {
    setQuickCreating(true);
    try {
      const res = await apiFetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Nueva sesion",
          projectName: activeProjectId || undefined,
          agentId: activeAgent?.id || undefined,
          teamId: activeTeam?.id || undefined,
        }),
      });
      if (!res.ok) return;
      const session = await res.json();
      onNavigate(getSessionPath(session.id));
      setSidebarOpen?.(false);
    } catch {
      // silently ignore
    } finally {
      setQuickCreating(false);
    }
  }, [onNavigate, getSessionPath, activeProjectId, activeAgent, activeTeam, setSidebarOpen]);

  return {
    quickCreating,
    getSessionPath,
    handleSelectSession,
    handleNewSession,
    handleQuickCreate,
  };
}
