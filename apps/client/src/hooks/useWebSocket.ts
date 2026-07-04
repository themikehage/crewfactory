import { useEffect, useCallback, useState } from "react";
import { wsClient } from "@/lib/ws-client";

type EventHandler = (data: unknown) => void;

interface WebSocketState {
  connected: boolean;
  send: (data: Record<string, unknown>) => void;
  subscribe: (type: string, handler: EventHandler) => () => void;
}

export function useWebSocket(sessionId: string | null): WebSocketState {
  const [connected, setConnected] = useState<boolean>(wsClient.getState() === "connected");

  useEffect(() => {
    const unsub = wsClient.onStateChange((state) => {
      setConnected(state === "connected");
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    if (wsClient.getState() === "connected") {
      wsClient.send({ type: "session_subscribe", sessionId });
    }
    const unsub = wsClient.onStateChange((state) => {
      if (state === "connected") {
        wsClient.send({ type: "session_subscribe", sessionId });
      }
    });
    return unsub;
  }, [sessionId]);

  const send = useCallback(
    (data: Record<string, unknown>) => {
      wsClient.send({ ...data, sessionId });
    },
    [sessionId]
  );

  const subscribe = useCallback((type: string, handler: EventHandler) => {
    return wsClient.subscribe(type, handler);
  }, []);

  return { connected, send, subscribe };
}