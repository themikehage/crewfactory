import { useState, useEffect, useCallback } from "react";

interface SessionItem {
  id: string;
  name: string;
  createdAt: string;
  messageCount: number;
}

interface Props {
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewSession: (id: string) => void;
}

export function SessionSidebar({ activeSessionId, onSelectSession, onNewSession }: Props) {
  const [sessions, setSessions] = useState<SessionItem[]>(() => {
    const raw = localStorage.getItem("pi-sessions");
    if (raw) {
      try { return JSON.parse(raw); } catch { return []; }
    }
    return [];
  });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    localStorage.setItem("pi-sessions", JSON.stringify(sessions));
  }, [sessions]);

  const createSession = useCallback(async () => {
    setCreating(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: `Session ${sessions.length + 1}` }),
      });
      if (!res.ok) return;
      const session = await res.json();
      setSessions((prev) => [session, ...prev]);
      onNewSession(session.id);
    } finally {
      setCreating(false);
    }
  }, [sessions.length, onNewSession]);

  const deleteSession = useCallback(
    async (id: string) => {
      const token = localStorage.getItem("token");
      await fetch(`/api/sessions/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const remaining = sessions.filter((s) => s.id !== id);
      setSessions(remaining);
      if (activeSessionId === id) {
        onSelectSession(remaining[0]?.id ?? "");
      }
    },
    [activeSessionId, onSelectSession, sessions]
  );

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-surface">
        <button
          onClick={createSession}
          disabled={creating}
          className="w-full py-2 text-sm bg-accent text-bg rounded-lg
                     hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {creating ? "Creating..." : "+ New Session"}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {sessions.map((s) => (
          <div key={s.id} className="group relative">
            <button
              onClick={() => onSelectSession(s.id)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                activeSessionId === s.id
                  ? "bg-surface-hover text-text-primary"
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
                         text-text-secondary hover:text-error transition-colors p-1 text-xs opacity-40 hover:opacity-100"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                <path d="M4 4l6 6M10 4l-6 6" stroke="currentColor" strokeWidth="2" fill="none" />
              </svg>
            </button>
          </div>
        ))}
        {sessions.length === 0 && (
          <p className="text-text-secondary text-sm text-center py-8">
            No sessions yet
          </p>
        )}
      </div>
    </div>
  );
}
