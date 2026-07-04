import { useState, useEffect, useCallback, useRef } from "react";
import type { Channel, ChannelMessage, AddMember, UpdateMember, UpdateChannel } from "shared";

function getToken() {
  return localStorage.getItem("token") || "";
}

export interface StreamingAgentState {
  agentId: string;
  agentName?: string;
  text: string;
  thinking?: string;
  toolCalls?: Record<string, { toolName: string; args: any; result: any | null; isError: boolean }>;
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

  const fetchActiveStreamings = useCallback(async () => {
    if (!channelId) return;
    try {
      const url = `/api/channels/${channelId}/active-streamings${sessionId ? `?sessionId=${sessionId}` : ""}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      
      setStreamingAgents((prev) => {
        const merged = { ...prev };
        for (const [agentId, serverStream] of Object.entries(data.streamingAgents || {})) {
          const s = serverStream as StreamingAgentState;
          if (merged[agentId]) {
            // Keep the longer text/thinking to avoid losing any web socket deltas
            merged[agentId] = {
              ...s,
              text: merged[agentId].text.length > s.text.length ? merged[agentId].text : s.text,
              thinking: (merged[agentId].thinking?.length || 0) > (s.thinking?.length || 0) ? merged[agentId].thinking : s.thinking,
              toolCalls: { ...s.toolCalls, ...merged[agentId].toolCalls }
            };
          } else {
            merged[agentId] = s;
          }
        }
        return merged;
      });
    } catch (err: any) {
      console.error("Failed to load active channel streamings:", err);
    }
  }, [channelId, sessionId]);

  useEffect(() => {
    if (!channelId) {
      setChannel(null);
      setMessages([]);
      setStreamingAgents({});
      setLoading(false);
      return;
    }
    // Clear stale state immediately on channel or session change to avoid showing old data
    setMessages([]);
    setStreamingAgents({});
    setLoading(true);
    setError(null);
    Promise.all([fetchChannel(), fetchMessages(), fetchActiveStreamings()]).finally(() => setLoading(false));
  }, [channelId, sessionId, fetchChannel, fetchMessages, fetchActiveStreamings]);


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
            const current = prev[data.agentId] || { agentId: data.agentId, text: "" };
            return {
              ...prev,
              [data.agentId]: { ...current, text: current.text + data.token },
            };
          });
        } else if (data.type === "channel_agent_thinking") {
          setStreamingAgents((prev) => {
            const current = prev[data.agentId] || { agentId: data.agentId, text: "" };
            return {
              ...prev,
              [data.agentId]: { ...current, thinking: (current.thinking || "") + data.token },
            };
          });
        } else if (data.type === "channel_agent_tool_start") {
          setStreamingAgents((prev) => {
            const current = prev[data.agentId] || { agentId: data.agentId, text: "" };
            const tools = { ...(current.toolCalls || {}) };
            tools[data.toolCallId] = { toolName: data.toolName, args: data.args, result: null, isError: false };
            return {
              ...prev,
              [data.agentId]: { ...current, toolCalls: tools },
            };
          });
        } else if (data.type === "channel_agent_tool_end") {
          setStreamingAgents((prev) => {
            const current = prev[data.agentId] || { agentId: data.agentId, text: "" };
            const tools = { ...(current.toolCalls || {}) };
            if (tools[data.toolCallId]) {
              tools[data.toolCallId] = {
                ...tools[data.toolCallId],
                result: {
                  toolName: data.toolName,
                  content: Array.isArray(data.result) ? data.result : [{ type: "text", text: String(data.result) }],
                  isError: data.isError
                },
                isError: data.isError
              };
            }
            return {
              ...prev,
              [data.agentId]: { ...current, toolCalls: tools },
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
  }, [channelId, sessionId]);

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

  const updateChannel = useCallback(
    async (data: UpdateChannel) => {
      if (!channelId) return;
      const res = await fetch(`/api/channels/${channelId}`, {
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

  return {
    channel,
    messages,
    streamingAgents,
    loading,
    error,
    fetchChannel,
    sendMessage,
    abortDispatch,
    updateChannel,
    addMember,
    updateMember,
    removeMember,
  };
}
