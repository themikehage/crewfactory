import { useState, useEffect, useCallback, useMemo } from "react";
import { Trash2 } from "lucide-react";
import { useSessionStatusWs } from "@/hooks/useSessionStatusWs";
import type { SessionStatus } from "@/hooks/useSessionStatusWs";
import { apiFetch } from "@/lib/api";
import { useLiterals } from "@/lib";
import { literals as u } from "./SessionPopover.literals";

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
  activeRepoFriendlyName?: string | null;
  activeAgent: { id: string; name: string; avatarUrl?: string } | null;
  activeChannel: { id: string; name: string } | null;
  onSelectSession: (id: string) => void;
  onNewSession: (id: string) => void;
}

const statusConfig: Record<SessionStatus, { color: string; label: string }> = {
  active: { color: "bg-primary", label: "Active" },
  streaming: { color: "bg-warning", label: "Streaming..." },
  "task-running": { color: "bg-primary", label: "Task Running..." },
  sleeping: { color: "bg-text-secondary/30", label: "Sleeping" },
};

export function SessionPopover({
  isOpen,
  onClose,
  activeSessionId,
  activeRepoName,
  activeRepoFriendlyName = null,
  activeAgent,
  activeChannel,
  onSelectSession,
  onNewSession,
}: Props) {
  const l = useLiterals(u);
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const sessionStatuses = useSessionStatusWs();

  const fetchSessions = useCallback(async () => {
    try {
      const res = await apiFetch("/api/sessions");
      if (!res.ok) return;
      const data = await res.json();
      const mapped = (data.sessions ?? []).map((s: SessionItem) => ({
        ...s,
        status: sessionStatuses[s.id] || s.status,
      }));
      setSessions(mapped);
    } catch {
      // silently ignore fetch errors
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

  const [showExecutions, setShowExecutions] = useState(false);

  const filteredSessions = useMemo(() => {
    return sessions.filter((s) => {
      const isExec = s.id.startsWith("exec_") || (s as any).isExecution;
      if (isExec && !showExecutions) return false;

      if (activeChannel) return s.channelId === activeChannel.id;
      if (activeAgent) return s.agentId === activeAgent.id && !s.channelId;
      if (activeRepoName) return s.repoName === activeRepoName && !s.agentId && !s.channelId;
      return !s.repoName && !s.agentId && !s.channelId;
    });
  }, [sessions, activeRepoName, activeAgent, activeChannel, showExecutions]);

  const createSession = useCallback(async () => {
    setCreating(true);
    try {
      const sessionCount = filteredSessions.length;
      const sessionName = activeChannel
        ? `#${activeChannel.name} - Session ${sessionCount + 1}`
        : activeAgent
        ? `${activeAgent.name} - Session ${sessionCount + 1}`
        : activeRepoFriendlyName
        ? `${activeRepoFriendlyName} - Session ${sessionCount + 1}`
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
      if (!res.ok) return;
      const session = await res.json();
      const updated = [{ ...session, status: "active" as SessionStatus }, ...sessions];
      setSessions(updated);
      onNewSession(session.id);
      onClose();
    } catch {
      // silently ignore
    } finally {
      setCreating(false);
    }
  }, [filteredSessions.length, activeRepoName, activeAgent, activeChannel, onNewSession, sessions]);

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
    if (activeRepoFriendlyName) return activeRepoFriendlyName;
    return l.contextGlobal;
  }, [activeChannel, activeAgent, activeRepoFriendlyName]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop transparente para cerrar con click fuera */}
      <div
        className="fixed inset-0 z-40 bg-transparent"
        onClick={onClose}
      />

      {/* Popover flotante */}
      <div className="absolute right-0 top-full mt-2 w-80 bg-card border border-input rounded-xl shadow-2xl flex flex-col z-55 animate-scale-in max-h-[420px] overflow-hidden">
        {/* Header */}
        <div className="p-3 border-b border-input flex items-center justify-between flex-shrink-0 bg-card/80 backdrop-blur-md">
          <div className="flex flex-col min-w-0">
            <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Historial de Sesiones</span>
            <span className="text-xs font-bold text-primary truncate" title={contextLabel}>
              {contextLabel}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-card-hover rounded text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            title={l.close}
          >
            <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* Nueva Sesión */}
        <div className="p-2 border-b border-input flex-shrink-0 flex flex-col gap-2">
          <button
            onClick={createSession}
            disabled={creating}
            className="w-full py-1.5 text-xs bg-primary text-background rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity font-semibold cursor-pointer flex items-center justify-center gap-1"
          >
            {creating ? (
              l.creating
            ) : (
              <>
                <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
                </svg>
                Nueva Sesión
              </>
            )}
          </button>
          
          <label className="flex items-center justify-between px-1.5 py-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer select-none font-medium">
            <span>Ver Ejecuciones API/CLI</span>
            <input
              type="checkbox"
              checked={showExecutions}
              onChange={(e) => setShowExecutions(e.target.checked)}
              className="accent-accent w-3 h-3 rounded border-input bg-background cursor-pointer"
            />
          </label>
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1 bg-card/20 max-h-[300px]">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-8 space-y-2 text-muted-foreground">
              <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <span className="text-xs">Cargando sesiones...</span>
            </div>
          ) : filteredSessions.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground text-[11px]">
              Sin sesiones en este contexto
            </div>
          ) : (
            filteredSessions.map((s) => {
              const isExec = s.id.startsWith("exec_") || (s as any).isExecution;
              const cfg = s.status ? statusConfig[s.status] : null;
              const isActive = activeSessionId === s.id;
              return (
                <div key={s.id} className="group relative">
                  <button
                    onClick={() => {
                      onSelectSession(s.id);
                      onClose();
                    }}
                    className={`w-full text-left px-2.5 py-2 rounded-lg text-xs transition-all cursor-pointer ${
                      isActive
                        ? "bg-card-hover/80 text-foreground border border-input"
                        : "text-muted-foreground hover:bg-card-hover/40 hover:text-foreground border border-transparent"
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      {cfg && !isExec && (
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.color}`} title={cfg.label} />
                      )}
                      {isExec && (
                        <span className={`text-xs px-1 py-0.2 rounded font-bold uppercase flex-shrink-0 ${
                          s.id.includes("_channel_") ? "bg-primary/15 text-primary border border-primary/20" : "bg-purple-500/15 text-purple-400 border border-purple-500/20"
                        }`}>
                          {s.id.includes("_channel_") ? "CLI" : "API"}
                        </span>
                      )}
                      <span className="truncate flex-1 font-medium font-sans">{s.name}</span>
                    </div>
                    <div className="flex items-center justify-between mt-0.5 text-xs text-muted-foreground">
                      <span>{isExec ? l.histExec : `${s.messageCount} ${s.messageCount === 1 ? l.message : l.messages}`}</span>
                      {s.status && s.status !== "sleeping" && !isExec && (
                        <span className={`font-semibold ${cfg?.color.replace("bg-", "text-") || "text-muted-foreground"}`}>
                          {cfg?.label}
                        </span>
                      )}
                    </div>
                  </button>
                  {!isExec && (
                    <button
                      onClick={(e) => handleDeleteClick(e, s.id)}
                      className="absolute right-2 top-1/2 -translate-y-1/2
                                 text-muted-foreground hover:text-destructive transition-colors p-1 rounded hover:bg-card-hover cursor-pointer"
                      title={l.deleteSession}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Modal de confirmación de borrado */}
        {confirmDeleteId && (
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 backdrop-blur-xs animate-fade-in">
            <div className="bg-card border border-input rounded-xl p-4 mx-4 max-w-xs w-full shadow-2xl animate-scale-in">
              <p className="text-xs font-medium text-foreground mb-3">
                ¿Estás seguro de que querés borrar esta sesión? Se eliminarán todos los mensajes.
              </p>
              <div className="flex justify-end gap-2">
                <button
                  onClick={handleCancelDelete}
                  className="px-2.5 py-1.5 text-xs rounded-lg bg-card-hover text-muted-foreground hover:text-foreground transition-colors cursor-pointer font-medium"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleConfirmDelete}
                  className="px-2.5 py-1.5 text-xs rounded-lg bg-destructive text-white hover:opacity-90 transition-opacity cursor-pointer font-medium"
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
