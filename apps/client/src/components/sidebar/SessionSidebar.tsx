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
}

const statusConfig: Record<SessionStatus, { color: string; label: string }> = {
  active: { color: "bg-success", label: "Active" },
  streaming: { color: "bg-warning", label: "Streaming..." },
  "task-running": { color: "bg-accent", label: "Task Running..." },
  sleeping: { color: "bg-text-secondary/30", label: "Sleeping" },
};

export function SessionSidebar({ activeSessionId, activeRepoName, activeAgent, activeChannel, onSelectSession, onNewSession }: Props) {
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

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-surface">
        <button
          onClick={createSession}
          disabled={creating}
          className="w-full py-2 text-sm bg-accent text-bg rounded-lg
                     hover:opacity-90 disabled:opacity-50 transition-opacity font-medium cursor-pointer"
        >
          {creating ? "Creating..." : activeRepoName ? "+ New Repo Session" : "+ New Global Session"}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {filteredSessions.map((s) => {
          const cfg = s.status ? statusConfig[s.status] : null;
          return (
            <div key={s.id} className="group relative">
              <button
                onClick={() => onSelectSession(s.id)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer ${
                  activeSessionId === s.id
                    ? "bg-surface-hover text-text-primary font-medium"
                    : "text-text-secondary hover:bg-surface hover:text-text-primary"
                }`}
              >
                <div className="flex items-center gap-2">
                  {cfg && (
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.color}`} title={cfg.label} />
                  )}
                  <span className="truncate flex-1">{s.name}</span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-text-secondary/70">
                    {s.messageCount} messages
                  </span>
                  {s.status && (
                    <span className={`text-[10px] ${cfg?.color.replace("bg-", "text-") || "text-text-secondary/50"}`}>
                      {cfg?.label}
                    </span>
                  )}
                </div>
              </button>
              <button
                onClick={(e) => handleDeleteClick(e, s.id)}
                className="absolute right-2 top-1/2 -translate-y-1/2
                           text-text-secondary hover:text-error transition-colors p-1 text-xs opacity-40 hover:opacity-100 cursor-pointer"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                  <path d="M4 4l6 6M10 4l-6 6" stroke="currentColor" strokeWidth="2" fill="none" />
                </svg>
              </button>
            </div>
          );
        })}
        {filteredSessions.length === 0 && (
          <p className="text-text-secondary text-sm text-center py-8">
            No sessions yet
          </p>
        )}
      </div>

      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-surface border border-surface-hover rounded-lg p-4 mx-4 max-w-xs w-full shadow-lg">
            <p className="text-sm text-text-primary mb-3">
              Are you sure you want to delete this session?
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={handleCancelDelete}
                className="px-3 py-1.5 text-xs rounded-md bg-surface-hover text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                className="px-3 py-1.5 text-xs rounded-md bg-error text-white hover:opacity-90 transition-opacity cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
