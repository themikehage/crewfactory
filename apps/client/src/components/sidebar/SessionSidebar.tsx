import { useState, useEffect, useCallback, useMemo } from "react";

interface SessionItem {
  id: string;
  name: string;
  createdAt: string;
  messageCount: number;
  repoName?: string;
}

interface Props {
  activeSessionId: string | null;
  activeRepoName: string | null;
  onSelectSession: (id: string) => void;
  onNewSession: (id: string) => void;
}

export function SessionSidebar({ activeSessionId, activeRepoName, onSelectSession, onNewSession }: Props) {
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const fetchSessions = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/sessions", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const list = data.sessions ?? [];
        setSessions(list);
        localStorage.setItem("pi-sessions", JSON.stringify(list));
        return;
      }
    } catch {}
    const cached = localStorage.getItem("pi-sessions");
    if (cached) {
      try { setSessions(JSON.parse(cached)); } catch {}
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchSessions().finally(() => setLoading(false));
  }, [fetchSessions]);

  const filteredSessions = useMemo(() => {
    return sessions.filter((s) =>
      activeRepoName ? s.repoName === activeRepoName : !s.repoName
    );
  }, [sessions, activeRepoName]);

  useEffect(() => {
    if (loading || activeSessionId || creating) return;

    if (filteredSessions.length > 0) {
      onSelectSession(filteredSessions[0].id);
    } else {
      createSession();
    }
  }, [loading, activeSessionId, filteredSessions, onSelectSession, creating]);

  const createSession = useCallback(async () => {
    setCreating(true);
    try {
      const token = localStorage.getItem("token");
      const sessionCount = filteredSessions.length;
      const sessionName = activeRepoName
        ? `${activeRepoName} - Session ${sessionCount + 1}`
        : `Global Session ${sessionCount + 1}`;

      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: sessionName,
          repoName: activeRepoName || undefined
        }),
      });
      if (!res.ok) return;
      const session = await res.json();
      const updated = [session, ...sessions];
      setSessions(updated);
      localStorage.setItem("pi-sessions", JSON.stringify(updated));
      onNewSession(session.id);
    } finally {
      setCreating(false);
    }
  }, [filteredSessions.length, activeRepoName, onNewSession, sessions]);

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

  const deleteSession = useCallback(
    async (id: string) => {
      const token = localStorage.getItem("token");
      await fetch(`/api/sessions/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const remaining = sessions.filter((s) => s.id !== id);
      setSessions(remaining);
      localStorage.setItem("pi-sessions", JSON.stringify(remaining));

      const filteredRemaining = remaining.filter((s) =>
        activeRepoName ? s.repoName === activeRepoName : !s.repoName
      );

      if (activeSessionId === id) {
        onSelectSession(filteredRemaining[0]?.id ?? "");
      }
    },
    [activeSessionId, onSelectSession, sessions, activeRepoName]
  );

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
        {filteredSessions.map((s) => (
          <div key={s.id} className="group relative">
            <button
              onClick={() => onSelectSession(s.id)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer ${
                activeSessionId === s.id
                  ? "bg-surface-hover text-text-primary font-medium"
                  : "text-text-secondary hover:bg-surface hover:text-text-primary"
              }`}
            >
              <div className="truncate">{s.name}</div>
              <div className="text-xs text-text-secondary/70">
                {s.messageCount} messages
              </div>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                deleteSession(s.id);
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2
                         text-text-secondary hover:text-error transition-colors p-1 text-xs opacity-40 hover:opacity-100 cursor-pointer"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                <path d="M4 4l6 6M10 4l-6 6" stroke="currentColor" strokeWidth="2" fill="none" />
              </svg>
            </button>
          </div>
        ))}
        {filteredSessions.length === 0 && (
          <p className="text-text-secondary text-sm text-center py-8">
            No sessions yet
          </p>
        )}
      </div>
    </div>
  );
}
