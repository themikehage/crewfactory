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
  isOpen: boolean;
  onClose: () => void;
  activeSessionId: string | null;
  activeRepoName: string | null;
  activeAgent: { id: string; name: string } | null;
  activeChannel: { id: string; name: string } | null;
  onSelectSession: (id: string) => void;
  onNewSession: (id: string) => void;
}

const statusConfig: Record<SessionStatus, { color: string; label: string }> = {
  active: { color: "bg-success", label: "Active" },
  streaming: { color: "bg-warning", label: "Streaming..." },
  "task-running": { color: "bg-accent", label: "Task Running..." },
  sleeping: { color: "bg-text-secondary/30", label: "Sleeping" },
};

export function SessionDrawer({
  isOpen,
  onClose,
  activeSessionId,
  activeRepoName,
  activeAgent,
  activeChannel,
  onSelectSession,
  onNewSession,
}: Props) {
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const sessionStatuses = useSessionStatusWs();

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
    if (isOpen) {
      fetchSessions().finally(() => setLoading(false));
    }
  }, [isOpen, fetchSessions]);

  useEffect(() => {
    setSessions((prev) =>
      prev.map((s) => ({
        ...s,
        status: sessionStatuses[s.id] || s.status,
      }))
    );
  }, [sessionStatuses]);

  // Listener para renombrar sesión en tiempo real
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

  // Si no hay sesiones para este contexto, crear una automáticamente
  useEffect(() => {
    console.log("SessionDrawer Auto-select check:", { isOpen, loading, activeSessionId, creating, hasError, filteredSessionsLength: filteredSessions.length });
    if (!isOpen) return;
    if (loading || activeSessionId || creating || hasError) {
      console.log("SessionDrawer Auto-select skipped because:", { loading, activeSessionId, creating, hasError });
      return;
    }

    console.log("SessionDrawer Auto-select executing with:", { filteredSessions });
    if (filteredSessions.length > 0) {
      onSelectSession(filteredSessions[0].id);
    } else {
      createSession();
    }
  }, [isOpen, loading, activeSessionId, filteredSessions, onSelectSession, creating, hasError, createSession]);

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

  const contextLabel = useMemo(() => {
    if (activeChannel) return `#${activeChannel.name}`;
    if (activeAgent) return activeAgent.name;
    if (activeRepoName) return activeRepoName;
    return "Global";
  }, [activeChannel, activeAgent, activeRepoName]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs transition-opacity duration-300"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-80 bg-surface z-50 shadow-2xl border-l border-surface-hover flex flex-col transition-transform duration-300 animate-slide-in">
        {/* Header del Drawer */}
        <div className="p-4 border-b border-surface-hover flex items-center justify-between flex-shrink-0 bg-surface/80 backdrop-blur-md">
          <div className="flex flex-col min-w-0">
            <span className="text-[10px] text-text-secondary/70 uppercase tracking-wider font-semibold">Historial de Sesiones</span>
            <span className="text-xs font-bold text-accent truncate" title={contextLabel}>
              {contextLabel}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-surface-hover rounded-lg text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
            title="Cerrar"
          >
            <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* Acciones principales */}
        <div className="p-3 border-b border-surface-hover flex-shrink-0">
          <button
            onClick={createSession}
            disabled={creating}
            className="w-full py-2 text-xs bg-accent text-bg rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity font-semibold cursor-pointer flex items-center justify-center gap-1.5"
          >
            {creating ? (
              "Creando..."
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
                </svg>
                Nueva Sesión
              </>
            )}
          </button>
        </div>

        {/* Lista de Sesiones */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1 bg-surface/20">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-32 space-y-2 text-text-secondary/50">
              <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              <span className="text-xs">Cargando sesiones...</span>
            </div>
          ) : filteredSessions.length === 0 ? (
            <div className="text-center py-8 text-text-secondary/50 text-xs">
              Sin sesiones en este contexto
            </div>
          ) : (
            filteredSessions.map((s) => {
              const cfg = s.status ? statusConfig[s.status] : null;
              const isActive = activeSessionId === s.id;
              return (
                <div key={s.id} className="group relative">
                  <button
                    onClick={() => {
                      onSelectSession(s.id);
                      onClose();
                    }}
                    className={`w-full text-left px-3.5 py-2.5 rounded-lg text-xs transition-all cursor-pointer ${
                      isActive
                        ? "bg-surface-hover/80 text-text-primary border border-surface-hover"
                        : "text-text-secondary hover:bg-surface-hover/40 hover:text-text-primary border border-transparent"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {cfg && (
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.color}`} title={cfg.label} />
                      )}
                      <span className="truncate flex-1 font-medium font-sans">{s.name}</span>
                    </div>
                    <div className="flex items-center justify-between mt-1 text-[10px] text-text-secondary/60">
                      <span>{s.messageCount} mensajes</span>
                      {s.status && s.status !== "sleeping" && (
                        <span className={`font-semibold ${cfg?.color.replace("bg-", "text-") || "text-text-secondary/50"}`}>
                          {cfg?.label}
                        </span>
                      )}
                    </div>
                  </button>
                  <button
                    onClick={(e) => handleDeleteClick(e, s.id)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2
                               text-text-secondary hover:text-error transition-colors p-1.5 rounded hover:bg-surface-hover opacity-0 group-hover:opacity-100 cursor-pointer"
                    title="Eliminar Sesión"
                  >
                    <svg width="12" height="12" viewBox="0 0 14 14" fill="currentColor">
                      <path d="M4 4l6 6M10 4l-6 6" stroke="currentColor" strokeWidth="1.5" fill="none" />
                    </svg>
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Modal de confirmación de borrado */}
        {confirmDeleteId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs">
            <div className="bg-surface border border-surface-hover rounded-xl p-5 mx-4 max-w-xs w-full shadow-2xl animate-scale-in">
              <p className="text-sm font-medium text-text-primary mb-4">
                ¿Estás seguro de que querés borrar esta sesión? Se eliminarán todos los mensajes.
              </p>
              <div className="flex justify-end gap-2.5">
                <button
                  onClick={handleCancelDelete}
                  className="px-3.5 py-2 text-xs rounded-lg bg-surface-hover text-text-secondary hover:text-text-primary transition-colors cursor-pointer font-medium"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleConfirmDelete}
                  className="px-3.5 py-2 text-xs rounded-lg bg-error text-white hover:opacity-90 transition-opacity cursor-pointer font-medium"
                >
                  Borrar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
