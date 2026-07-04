import { useState, useEffect } from "react";
import { wsClient } from "@/lib/ws-client";

export type SessionStatus = "active" | "streaming" | "task-running" | "sleeping";

type StatusMap = Record<string, SessionStatus>;

export function useSessionStatusWs(): StatusMap {
  const [statuses, setStatuses] = useState<StatusMap>({});

  useEffect(() => {
    const unsub = wsClient.subscribe("session_status", (data: unknown) => {
      const d = data as { sessionId: string; status: SessionStatus };
      setStatuses((prev) => ({ ...prev, [d.sessionId]: d.status }));
    });
    return unsub;
  }, []);

  return statuses;
}