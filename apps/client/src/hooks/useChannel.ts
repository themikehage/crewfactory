import { useState, useEffect, useCallback, useRef } from "react";
import type { Channel, ChannelMessage, AddMember, UpdateMember } from "shared";

function getToken() {
  return localStorage.getItem("token") || "";
}

export interface StreamingAgentState {
  agentId: string;
  agentName?: string;
  text: string;
}

export function useChannel(channelId: string | null, sessionId?: string | null) {
  const [channel, setChannel] = useState<Channel | null>(null);
  const [messages, setMessages] = useState<ChannelMessage[]>([]);
  const [streamingAgents, setStreamingAgents] = useState<Record<string, StreamingAgentState>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);

  const fetchChannel = useCallback(async () => {
    if (!channelId) return;
    try {
      const res = await fetch(`/api/channels/${channelId}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setChannel(data);
    } catch (err: any) {
      setError(err.message || "Failed to load channel");
    }
  }, [channelId]);

  const fetchMessages = useCallback(async () => {
    if (!channelId) return;
    try {
      const url = `/api/channels/${channelId}/messages?limit=100${sessionId ? `&sessionId=${sessionId}` : ""}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setMessages(data.messages || []);
    } catch (err: any) {
      console.error("Failed to load channel messages:", err);
    }
  }, [channelId, sessionId]);

  useEffect(() => {
    if (!channelId) {
      setChannel(null);
      setMessages([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    Promise.all([fetchChannel(), fetchMessages()]).finally(() => setLoading(false));
  }, [channelId, fetchChannel, fetchMessages]);

  // WebSocket Connection for channel events
  useEffect(() => {
    if (!channelId) return;

    const token = getToken();
    if (!token) return;

    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${location.host}/ws`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "auth", token }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === "auth_success") {
          ws.send(JSON.stringify({ type: "channel_join", channelId }));
          return;
        }

        if (data.channelId && data.channelId !== channelId) return;
        if (sessionId && data.sessionId && data.sessionId !== sessionId) return;

        if (data.type === "channel_message") {
          const newMsg: ChannelMessage = data.message;
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            if (sessionId && newMsg.sessionId !== sessionId) return prev;
            return [...prev, newMsg];
          });
        } else if (data.type === "channel_agent_start") {
          setStreamingAgents((prev) => ({
            ...prev,
            [data.agentId]: { agentId: data.agentId, agentName: data.agentName, text: "" },
          }));
        } else if (data.type === "channel_agent_token") {
          setStreamingAgents((prev) => {
            const current = prev[data.agentId];
            if (!current) return prev;
            return {
              ...prev,
              [data.agentId]: { ...current, text: current.text + data.token },
            };
          });
        } else if (data.type === "channel_agent_end" || data.type === "channel_agent_error") {
          setStreamingAgents((prev) => {
            const next = { ...prev };
            delete next[data.agentId];
            return next;
          });
        } else if (data.type === "channel_dispatch_aborted" || data.type === "channel_chain_limit") {
          setStreamingAgents({});
        }
      } catch {}
    };

    ws.onclose = () => {
      wsRef.current = null;
    };

    return () => {
      ws.close();
    };
  }, [channelId]);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!channelId || !content.trim()) return;
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "channel_send", channelId, sessionId, message: content }));
      } else {
        // Fallback REST
        await fetch(`/api/channels/${channelId}/send`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getToken()}`,
          },
          body: JSON.stringify({ message: content, sessionId }),
        });
      }
    },
    [channelId, sessionId]
  );

  const abortDispatch = useCallback(async () => {
    if (!channelId) return;
    setStreamingAgents({});
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "channel_abort", channelId, sessionId }));
    } else {
      await fetch(`/api/channels/${channelId}/abort`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ sessionId }),
      });
    }
  }, [channelId, sessionId]);

  const addMember = useCallback(
    async (data: AddMember) => {
      if (!channelId) return;
      const res = await fetch(`/api/channels/${channelId}/members`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed to add member" }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const updated = await res.json();
      setChannel(updated);
    },
    [channelId]
  );

  const updateMember = useCallback(
    async (agentId: string, data: UpdateMember) => {
      if (!channelId) return;
      const res = await fetch(`/api/channels/${channelId}/members/${agentId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const updated = await res.json();
      setChannel(updated);
    },
    [channelId]
  );

  const removeMember = useCallback(
    async (agentId: string) => {
      if (!channelId) return;
      const res = await fetch(`/api/channels/${channelId}/members/${agentId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const updated = await res.json();
      setChannel(updated);
    },
    [channelId]
  );

  return {
    channel,
    messages,
    streamingAgents,
    loading,
    error,
    fetchChannel,
    sendMessage,
    abortDispatch,
    addMember,
    updateMember,
    removeMember,
  };
}
