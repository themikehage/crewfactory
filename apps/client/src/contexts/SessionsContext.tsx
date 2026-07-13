import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import { apiFetch } from "@/lib/api";
import { wsClient } from "@/lib/ws-client";

export type SessionStatus = "active" | "streaming" | "task-running" | "sleeping";

export interface SessionItem {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  status?: SessionStatus;
  projectName?: string;
  agentId?: string;
  channelId?: string;
  experimentId?: string;
  isExecution?: boolean;
}

export type KanbanColumn = "idle" | "working" | "done";

export interface SessionsContextType {
  sessions: SessionItem[];
  statuses: Record<string, SessionStatus>;
  loading: boolean;
  error: string | null;
  refetch: () => void;
  totalCount: number;
  workingCount: number;
  idleCount: number;
  doneCount: number;
  workingSessions: SessionItem[];
  idleSessions: SessionItem[];
  doneSessions: SessionItem[];
  getAgentStatus: (agentId: string) => SessionStatus | null;
  getAgentKanbanStatus: (agentId: string) => KanbanColumn | "unknown";
  getChannelMemberStatus: (memberId: string) => SessionStatus | null;
  getChannelMemberKanbanStatus: (memberId: string) => KanbanColumn | "unknown";
}

const SessionsContext = createContext<SessionsContextType | null>(null);

export function SessionsProvider({ children }: { children: ReactNode }) {
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [statuses, setStatuses] = useState<Record<string, SessionStatus>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSessions = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiFetch("/api/sessions");
      if (!res.ok) {
        setError("Failed to fetch sessions");
        return;
      }
      const data = await res.json();
      setSessions(data.sessions ?? []);
    } catch {
      setError("Failed to fetch sessions");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  useEffect(() => {
    const unsub = wsClient.subscribe("session_status", (data: unknown) => {
      const d = data as { sessionId: string; status: SessionStatus };
      setStatuses((prev) => ({ ...prev, [d.sessionId]: d.status }));
      setSessions((prev) =>
        prev.map((s) =>
          s.id === d.sessionId ? { ...s, status: d.status } : s
        )
      );
    });
    return unsub;
  }, []);

  useEffect(() => {
    const handleUpdate = () => {
      fetchSessions();
    };
    window.addEventListener("entity-updated", handleUpdate);
    return () => window.removeEventListener("entity-updated", handleUpdate);
  }, [fetchSessions]);

  const mergedSessions = useMemo(() => {
    return sessions.map((s) => ({
      ...s,
      status: statuses[s.id] || s.status || "sleeping",
    }));
  }, [sessions, statuses]);

  const derived = useMemo(() => {
    const working: SessionItem[] = [];
    const idle: SessionItem[] = [];
    const done: SessionItem[] = [];
    for (const s of mergedSessions) {
      if (s.isExecution) {
        done.push(s);
      } else if (
        s.status === "streaming" ||
        s.status === "active" ||
        s.status === "task-running"
      ) {
        working.push(s);
      } else {
        idle.push(s);
      }
    }
    return {
      workingSessions: working,
      idleSessions: idle,
      doneSessions: done,
      workingCount: working.length,
      idleCount: idle.length,
      doneCount: done.length,
      totalCount: mergedSessions.length,
    };
  }, [mergedSessions]);

  const getAgentStatus = useCallback(
    (agentId: string): SessionStatus | null => {
      const agentSessions = mergedSessions.filter(
        (s) => s.agentId === agentId
      );
      if (agentSessions.length === 0) return null;
      const priority: SessionStatus[] = [
        "streaming",
        "task-running",
        "active",
        "sleeping",
      ];
      for (const p of priority) {
        if (agentSessions.some((s) => s.status === p)) return p;
      }
      return "sleeping";
    },
    [mergedSessions]
  );

  const getAgentKanbanStatus = useCallback(
    (agentId: string): KanbanColumn | "unknown" => {
      const status = getAgentStatus(agentId);
      if (!status || status === "sleeping") return "idle";
      return "working";
    },
    [getAgentStatus]
  );

  const getChannelMemberStatus = useCallback(
    (memberId: string): SessionStatus | null => {
      return getAgentStatus(memberId);
    },
    [getAgentStatus]
  );

  const getChannelMemberKanbanStatus = useCallback(
    (memberId: string): KanbanColumn | "unknown" => {
      return getAgentKanbanStatus(memberId);
    },
    [getAgentKanbanStatus]
  );

  const value: SessionsContextType = useMemo(
    () => ({
      sessions: mergedSessions,
      statuses,
      loading,
      error,
      refetch: fetchSessions,
      ...derived,
      getAgentStatus,
      getAgentKanbanStatus,
      getChannelMemberStatus,
      getChannelMemberKanbanStatus,
    }),
    [
      mergedSessions,
      statuses,
      loading,
      error,
      fetchSessions,
      derived,
      getAgentStatus,
      getAgentKanbanStatus,
      getChannelMemberStatus,
      getChannelMemberKanbanStatus,
    ]
  );

  return (
    <SessionsContext.Provider value={value}>
      {children}
    </SessionsContext.Provider>
  );
}

export function useSessions(): SessionsContextType {
  const ctx = useContext(SessionsContext);
  if (!ctx) throw new Error("useSessions must be used within SessionsProvider");
  return ctx;
}
