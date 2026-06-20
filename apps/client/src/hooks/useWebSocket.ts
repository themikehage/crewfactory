import { useEffect, useRef, useCallback, useState } from "react";

type EventHandler = (data: unknown) => void;

interface WebSocketState {
  connected: boolean;
  send: (data: Record<string, unknown>) => void;
  subscribe: (type: string, handler: EventHandler) => () => void;
}

export function useWebSocket(sessionId: string | null): WebSocketState {
  const wsRef = useRef<WebSocket | null>(null);
  const handlersRef = useRef<Map<string, Set<EventHandler>>>(new Map());
  const [connected, setConnected] = useState<boolean>(false);
  const reconnectTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttempts = useRef<number>(0);

  const connect = useCallback(() => {
    if (!sessionId) return;

    const token = localStorage.getItem("token");
    if (!token) return;

    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${location.host}/ws`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      reconnectAttempts.current = 0;
      ws.send(JSON.stringify({ type: "auth", token, sessionId }));
      setConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "auth_error") {
          setConnected(false);
          ws.close();
          return;
        }
        const cbs = handlersRef.current.get(data.type);
        cbs?.forEach((cb) => cb(data));

        const wildcard = handlersRef.current.get("*");
        wildcard?.forEach((cb) => cb(data));
      } catch {
        // ignore parse errors
      }
    };

    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;

      const delay = Math.min(1000 * 2 ** reconnectAttempts.current, 30000);
      reconnectAttempts.current++;
      reconnectTimeout.current = setTimeout(connect, delay);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [sessionId]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimeout.current !== null) {
        clearTimeout(reconnectTimeout.current);
        reconnectTimeout.current = null;
      }
      wsRef.current?.close();
    };
  }, [connect]);

  const send = useCallback((data: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ ...data, sessionId }));
    }
  }, [sessionId]);

  const subscribe = useCallback((type: string, handler: EventHandler) => {
    if (!handlersRef.current.has(type)) {
      handlersRef.current.set(type, new Set());
    }
    handlersRef.current.get(type)!.add(handler);
    return () => {
      handlersRef.current.get(type)?.delete(handler);
    };
  }, []);

  return { connected, send, subscribe };
}
