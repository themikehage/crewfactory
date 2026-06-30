import { useState, useEffect, useCallback, useMemo } from "react";
import { useSessionStatusWs } from "@/hooks/useSessionStatusWs";
import type { SessionStatus } from "@/hooks/useSessionStatusWs";
import { apiFetch } from "@/lib/api";

interface SessionItem {
  id: string;
  name: string;
  createdAt: string;
  messageCount: number;
  status?: SessionStatus;
  repoName?: string;
  agentId?: string;
  channelId?: string;
}

interface Props {
  activeSessionId: string | null;
  activeRepoName: string | null;
  activeAgent: { id: string; name: string } | null;
  activeChannel: { id: string; name: string } | null;
  onSelectSession: (id: string) => void;
  onNewSession: (id: string) => void;
  currentPage?: string;
  onNavigate?: (path: string) => void;
  onSelectRepo?: (repoName: string | null) => void;
}

const statusConfig: Record<SessionStatus, { color: string; label: string }> = {
  active: { color: "bg-success", label: "Active" },
  streaming: { color: "bg-warning", label: "Streaming..." },
  "task-running": { color: "bg-accent", label: "Task Running..." },
  sleeping: { color: "bg-text-secondary/30", label: "Sleeping" },
};

export function SessionSidebar({
  activeSessionId,
  activeRepoName,
  activeAgent,
  activeChannel,
  onSelectSession,
  onNewSession,
  currentPage = "chat",
  onNavigate,
  onSelectRepo
}: Props) {
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [isOpenSessions, setIsOpenSessions] = useState(true);
  const sessionStatuses = useSessionStatusWs();

  const activeContext = useMemo(() => {
    if (activeChannel) {
      return { type: "channel", name: `#${activeChannel.name}`, display: activeChannel.name };
    }
    if (activeAgent) {
      return { type: "agent", name: activeAgent.name, display: activeAgent.name };
    }
    if (activeRepoName) {
      return { type: "repo", name: activeRepoName, display: activeRepoName };
    }
    return { type: "global", name: "Global Workspace", display: "Global" };
  }, [activeChannel, activeAgent, activeRepoName]);

  const handleClearContext = useCallback(() => {
    if (onSelectRepo) {
      onSelectRepo(null);
    }
  }, [onSelectRepo]);

  const fetchSessions = useCallback(async () => {
    try {
      const res = await apiFetch("/api/sessions");
      if (!res.ok) {
        setHasError(true);
        return;
      }
      const data = await res.json();
      const mapped = (data.sessions ?? []).map((s: SessionItem) => ({
        ...s,
        status: sessionStatuses[s.id] || s.status,
      }));
      setSessions(mapped);
      setHasError(false);
    } catch {
      setHasError(true);
    }
  }, [sessionStatuses]);

  useEffect(() => {
    fetchSessions().finally(() => setLoading(false));
  }, [fetchSessions]);

  useEffect(() => {
    setSessions((prev) =>
      prev.map((s) => ({
        ...s,
        status: sessionStatuses[s.id] || s.status,
      }))
    );
  }, [sessionStatuses]);

  useEffect(() => {
    const handleRename = (e: Event) => {
      const { sessionId, name } = (e as CustomEvent<{ sessionId: string; name: string }>).detail;
      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, name } : s))
      );
    };
    window.addEventListener("renameSession", handleRename);
    return () => window.removeEventListener("renameSession", handleRename);
  }, []);

  const filteredSessions = useMemo(() => {
    return sessions.filter((s) => {
      if (activeChannel) return s.channelId === activeChannel.id;
      if (activeAgent) return s.agentId === activeAgent.id && !s.channelId;
      if (activeRepoName) return s.repoName === activeRepoName && !s.agentId && !s.channelId;
      return !s.repoName && !s.agentId && !s.channelId;
    });
  }, [sessions, activeRepoName, activeAgent, activeChannel]);

  const createSession = useCallback(async () => {
    setCreating(true);
    try {
      const sessionCount = filteredSessions.length;
      const sessionName = activeChannel
        ? `#${activeChannel.name} - Session ${sessionCount + 1}`
        : activeAgent
        ? `${activeAgent.name} - Session ${sessionCount + 1}`
        : activeRepoName
        ? `${activeRepoName} - Session ${sessionCount + 1}`
        : `Global Session ${sessionCount + 1}`;

      const res = await apiFetch("/api/sessions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: sessionName,
          repoName: (activeAgent || activeChannel) ? undefined : (activeRepoName || undefined),
          agentId: (activeChannel) ? undefined : (activeAgent ? activeAgent.id : undefined),
          channelId: activeChannel ? activeChannel.id : undefined,
        }),
      });
      if (!res.ok) {
        setHasError(true);
        return;
      }
      const session = await res.json();
      const updated = [{ ...session, status: "active" as SessionStatus }, ...sessions];
      setSessions(updated);
      onNewSession(session.id);
      setHasError(false);
    } catch {
      setHasError(true);
    } finally {
      setCreating(false);
    }
  }, [filteredSessions.length, activeRepoName, activeAgent, activeChannel, onNewSession, sessions]);

  useEffect(() => {
    if (loading || activeSessionId || creating || hasError) return;

    if (filteredSessions.length > 0) {
      onSelectSession(filteredSessions[0].id);
    } else {
      createSession();
    }
  }, [loading, activeSessionId, filteredSessions, onSelectSession, creating, hasError, createSession]);

  const deleteSession = useCallback(
    async (id: string) => {
      await apiFetch(`/api/sessions/${id}`, {
        method: "DELETE",
      });

      const remaining = sessions.filter((s) => s.id !== id);
      setSessions(remaining);

      const filteredRemaining = remaining.filter((s) => {
        if (activeChannel) return s.channelId === activeChannel.id;
        if (activeAgent) return s.agentId === activeAgent.id && !s.channelId;
        if (activeRepoName) return s.repoName === activeRepoName && !s.agentId && !s.channelId;
        return !s.repoName && !s.agentId && !s.channelId;
      });

      if (activeSessionId === id) {
        onSelectSession(filteredRemaining[0]?.id ?? "");
      }
    },
    [activeSessionId, onSelectSession, sessions, activeRepoName, activeAgent, activeChannel]
  );

  const handleDeleteClick = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setConfirmDeleteId(id);
  }, []);

  const handleConfirmDelete = useCallback(() => {
    if (confirmDeleteId) {
      deleteSession(confirmDeleteId);
      setConfirmDeleteId(null);
    }
  }, [confirmDeleteId, deleteSession]);

  const handleCancelDelete = useCallback(() => {
    setConfirmDeleteId(null);
  }, []);

  const navItems = useMemo(() => [
    {
      id: "chat",
      label: "Chat",
      path: activeSessionId ? `/session/${activeSessionId}` : "/",
      icon: (
        <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" />
        </svg>
      ),
      visible: true
    },
    {
      id: "workspace",
      label: "Workspace (Files)",
      path: "/workspace",
      icon: (
        <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
          <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
        </svg>
      ),
      visible: true
    },
    {
      id: "preview",
      label: "Preview",
      path: "/preview",
      icon: (
        <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM4.332 8.027a6.012 6.012 0 011.912-2.706C6.512 5.73 6.974 6 7.5 6A1.5 1.5 0 019 7.5V8a2 2 0 004 0 2 2 0 011.523-1.943A5.977 5.977 0 0116 10c0 .34-.028.675-.083 1H15a2 2 0 00-2 2v2.197A5.973 5.973 0 0110 16v-2a2 2 0 00-2-2 2 2 0 01-2-2 2 2 0 00-1.668-1.973z" clipRule="evenodd" />
        </svg>
      ),
      visible: !!activeRepoName
    }
  ], [activeSessionId, activeRepoName]);

  const adminItems = useMemo(() => [
    {
      id: "projects",
      label: "Proyectos",
      path: "/projects",
      icon: (
        <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
          <path d="M7 3a1 1 0 000 2h5.586l-1.293 1.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L12.586 3H7z" />
          <path d="M4 5a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V7a2 2 0 00-2-2h-1.586l-1 1H16v8H4V6h1.586l-1-1H4z" />
        </svg>
      )
    },
    {
      id: "agents",
      label: "Agentes",
      path: "/agents",
      icon: (
        <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
          <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
        </svg>
      )
    },
    {
      id: "channels",
      label: "Canales",
      path: "/channels",
      icon: (
        <span className="font-bold text-xs select-none">#</span>
      )
    },
    {
      id: "skills",
      label: "Skills",
      path: "/skills",
      icon: (
        <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
          <path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 14c1.669 0 3.218.51 4.5 1.385A7.962 7.962 0 0114.5 14c1.255 0 2.443.29 3.5.804v-10A7.968 7.968 0 0014.5 4c-1.255 0-2.443.29-3.5.804V12a1 1 0 11-2 0V4.804z" />
        </svg>
      )
    },
    {
      id: "settings",
      label: "Ajustes",
      path: "/settings",
      icon: (
        <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
        </svg>
      )
    }
  ], []);

  return (
    <div className="flex flex-col h-full bg-bg select-none text-text-primary">
      {/* Selector de Contexto */}
      <div className="p-3 border-b border-surface">
        <div className="flex items-center justify-between bg-surface/30 rounded-lg p-2 border border-surface/50">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-accent flex-shrink-0">
              {activeContext.type === "global" && (
                <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM4.332 8.027a6.012 6.012 0 011.912-2.706C6.512 5.73 6.974 6 7.5 6A1.5 1.5 0 019 7.5V8a2 2 0 004 0 2 2 0 011.523-1.943A5.977 5.977 0 0116 10c0 .34-.028.675-.083 1H15a2 2 0 00-2 2v2.197A5.973 5.973 0 0110 16v-2a2 2 0 00-2-2 2 2 0 01-2-2 2 2 0 00-1.668-1.973z" clipRule="evenodd" />
                </svg>
              )}
              {activeContext.type === "repo" && (
                <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                </svg>
              )}
              {activeContext.type === "agent" && (
                <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                </svg>
              )}
              {activeContext.type === "channel" && (
                <span className="font-bold text-sm">#</span>
              )}
            </span>
            <div className="flex flex-col min-w-0">
              <span className="text-[9px] text-text-secondary/70 uppercase tracking-wider font-semibold">Contexto</span>
              <span className="text-xs font-bold text-text-primary truncate" title={activeContext.name}>
                {activeContext.display}
              </span>
            </div>
          </div>
          {activeContext.type !== "global" && (
            <button
              onClick={handleClearContext}
              className="p-1 hover:bg-surface rounded text-text-secondary hover:text-error transition-colors cursor-pointer"
              title="Volver a Global"
            >
              <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M3 10a1 1 0 011-1h8.586L9.707 6.707a1 1 0 011.414-1.414l5 5a1 1 0 010 1.414l-5 5a1 1 0 01-1.414-1.414L12.586 11H4a1 1 0 01-1-1z" clipRule="evenodd" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Enlaces de Navegación Principal */}
      <div className="p-2 border-b border-surface/60 space-y-1">
        {navItems.filter(item => item.visible).map(item => {
          const isActive = currentPage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate && onNavigate(item.path)}
              className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-xs transition-colors cursor-pointer text-left ${
                isActive
                  ? "bg-surface text-text-primary font-medium"
                  : "text-text-secondary hover:bg-surface/50 hover:text-text-primary"
              }`}
            >
              <span className={isActive ? "text-accent" : "text-text-secondary"}>
                {item.icon}
              </span>
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* Listado de Sesiones (Scrollable) */}
      <div className="flex-1 flex flex-col min-h-0">
        <button
          onClick={() => setIsOpenSessions(prev => !prev)}
          className="w-full flex items-center justify-between px-3 py-2 text-[9px] uppercase tracking-wider font-semibold text-text-secondary/70 hover:text-text-primary transition-colors cursor-pointer"
        >
          <span>Sesiones</span>
          <svg
            width="10"
            height="10"
            viewBox="0 0 20 20"
            fill="currentColor"
            className={`transform transition-transform ${isOpenSessions ? "rotate-90" : ""}`}
          >
            <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
          </svg>
        </button>

        {isOpenSessions && (
          <div className="flex-1 flex flex-col min-h-0">
            <div className="px-3 pb-2">
              <button
                onClick={createSession}
                disabled={creating}
                className="w-full py-1.5 text-xs bg-accent text-bg rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity font-medium cursor-pointer"
              >
                {creating ? "Creando..." : activeRepoName ? "+ Nueva Sesión Repo" : "+ Nueva Sesión Global"}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-2 space-y-1 min-h-0">
              {filteredSessions.map((s) => {
                const cfg = s.status ? statusConfig[s.status] : null;
                const isActive = activeSessionId === s.id;
                return (
                  <div key={s.id} className="group relative">
                     <button
                       onClick={() => onSelectSession(s.id)}
                       className={`w-full text-left px-3 py-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                         isActive
                           ? "bg-surface-hover text-text-primary font-medium"
                           : "text-text-secondary hover:bg-surface/50 hover:text-text-primary"
                       }`}
                     >
                       <div className="flex items-center gap-2">
                         {cfg && (
                           <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.color}`} title={cfg.label} />
                         )}
                         <span className="truncate flex-1 font-sans">{s.name}</span>
                       </div>
                       <div className="flex items-center gap-2 mt-0.5">
                         <span className="text-[10px] text-text-secondary/60">
                           {s.messageCount} mensajes
                         </span>
                         {s.status && s.status !== "sleeping" && (
                           <span className={`text-[9px] font-semibold ${cfg?.color.replace("bg-", "text-") || "text-text-secondary/50"}`}>
                             {cfg?.label}
                           </span>
                         )}
                       </div>
                     </button>
                    <button
                      onClick={(e) => handleDeleteClick(e, s.id)}
                      className="absolute right-2 top-1/2 -translate-y-1/2
                                 text-text-secondary hover:text-error transition-colors p-1 text-[10px] opacity-0 group-hover:opacity-100 cursor-pointer"
                    >
                      <svg width="12" height="12" viewBox="0 0 14 14" fill="currentColor">
                        <path d="M4 4l6 6M10 4l-6 6" stroke="currentColor" strokeWidth="1.5" fill="none" />
                      </svg>
                    </button>
                  </div>
                );
              })}
              {filteredSessions.length === 0 && (
                <p className="text-text-secondary/50 text-xs text-center py-4">
                  Sin sesiones
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Enlaces de Administración */}
      <div className="p-2 border-t border-surface/60 bg-surface/10 space-y-1 flex-shrink-0">
        <div className="px-3 py-1 text-[9px] uppercase tracking-wider font-semibold text-text-secondary/60">
          Administración
        </div>
        {adminItems.map(item => {
          const isActive = currentPage === item.id || (item.id === "channels" && (currentPage === "channel" || currentPage === "channels"));
          return (
            <button
              key={item.id}
              onClick={() => onNavigate && onNavigate(item.path)}
              className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-colors cursor-pointer text-left ${
                isActive
                  ? "bg-surface text-text-primary font-medium"
                  : "text-text-secondary hover:bg-surface/50 hover:text-text-primary"
              }`}
            >
              <span className={`${isActive ? "text-accent" : "text-text-secondary"} w-4 flex justify-center flex-shrink-0`}>
                {item.icon}
              </span>
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </div>

      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-surface border border-surface-hover rounded-lg p-4 mx-4 max-w-xs w-full shadow-lg">
            <p className="text-sm text-text-primary mb-3">
              ¿Estás seguro de que querés borrar esta sesión?
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={handleCancelDelete}
                className="px-3 py-1.5 text-xs rounded-md bg-surface-hover text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmDelete}
                className="px-3 py-1.5 text-xs rounded-md bg-error text-white hover:opacity-90 transition-opacity cursor-pointer"
              >
                Borrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
