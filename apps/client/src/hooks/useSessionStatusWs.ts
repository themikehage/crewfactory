import { useState, useEffect } from "react";

export type SessionStatus = "active" | "streaming" | "task-running" | "sleeping";

type StatusMap = Record<string, SessionStatus>;
type Listener = (map: StatusMap) => void;

let currentStatuses: StatusMap = {};
let ws: WebSocket | null = null;
let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;
const listeners = new Set<Listener>();

function notify() {
  listeners.forEach((fn) => fn(currentStatuses));
}

function connect() {
  const token = localStorage.getItem("token");
  if (!token) return;

  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const url = `${protocol}//${location.host}/ws`;

  ws = new WebSocket(url);

  ws.onopen = () => {
    reconnectAttempts = 0;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "auth", token }));
    }
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === "session_status") {
        currentStatuses = { ...currentStatuses, [data.sessionId]: data.status };
        notify();
      }
    } catch {}
  };

  ws.onclose = () => {
    ws = null;
    const delay = Math.min(1000 * 2 ** reconnectAttempts, 30000);
    reconnectAttempts++;
    reconnectTimeout = setTimeout(connect, delay);
  };

  ws.onerror = () => {
    ws?.close();
  };
}

function ensureConnected() {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    if (reconnectTimeout) clearTimeout(reconnectTimeout);
    connect();
  }
}

export function useSessionStatusWs(): StatusMap {
  const [statuses, setStatuses] = useState<StatusMap>(currentStatuses);

  useEffect(() => {
    ensureConnected();

    const handler: Listener = (map) => {
      setStatuses({ ...map });
    };

    listeners.add(handler);

    return () => {
      listeners.delete(handler);
    };
  }, []);

  return statuses;
}
