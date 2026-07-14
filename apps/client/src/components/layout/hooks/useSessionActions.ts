import { useState, useCallback } from "react";
import { apiFetch } from "@/lib/api";

interface UseSessionActionsProps {
  activeProjectId?: string | null;
  activeAgent: { id: string; name: string } | null;
  activeChannel: { id: string; name: string } | null;
  onNavigate: (path: string) => void;
  setSidebarOpen?: (open: boolean) => void;
}

export function useSessionActions({
  activeProjectId,
  activeAgent,
  activeChannel,
  onNavigate,
  setSidebarOpen,
}: UseSessionActionsProps) {
  const [quickCreating, setQuickCreating] = useState(false);

  const getSessionPath = useCallback(
    (id: string) => {
      if (activeChannel) return `/channels/${activeChannel.id}/session/${id}`;
      if (activeAgent) {
        if (activeAgent.id === "lab-architect") {
          return `/laboratory/session/${id}`;
        }
        return `/agents/${activeAgent.id}/session/${id}`;
      }
      if (activeProjectId) return `/projects/${activeProjectId}/session/${id}`;
      return `/session/${id}`;
    },
    [activeChannel?.id, activeAgent?.id, activeProjectId]
  );

  const handleSelectSession = useCallback(
    (id: string) => {
      if (id) {
        onNavigate(getSessionPath(id));
      } else {
        let basePath = "";
        if (activeChannel) basePath = `/channels/${activeChannel.id}/chat`;
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
    [onNavigate, getSessionPath, activeChannel?.id, activeAgent?.id, activeProjectId, setSidebarOpen]
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
          channelId: activeChannel?.id || undefined,
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
  }, [onNavigate, getSessionPath, activeProjectId, activeAgent, activeChannel, setSidebarOpen]);

  return {
    quickCreating,
    getSessionPath,
    handleSelectSession,
    handleNewSession,
    handleQuickCreate,
  };
}
