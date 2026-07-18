import { apiFetch } from "@/lib/api";
import { useState, useEffect, useCallback, useRef } from "react";
import type { Channel, ChannelExecution, ChannelExecutionEvent, ChannelMessage, AddMember, UpdateMember, UpdateChannel } from "shared";
import { wsClient } from "@/lib/ws-client";
import { useConnectionAwareEffect } from "./useConnectionAware";
import { applyChannelExecutionEvent, emptyChannelExecutionViewState, type ChannelExecutionViewState } from "@/lib/channel-execution-reducer";



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
  const executionViewRef = useRef<ChannelExecutionViewState>(emptyChannelExecutionViewState);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const channelIdRef = useRef(channelId);
  const sessionIdRef = useRef(sessionId);
  const prevChannelIdRef = useRef<string | null>(null);
  channelIdRef.current = channelId;
  sessionIdRef.current = sessionId;

  const fetchChannel = useCallback(async () => {
    if (!channelId) return;
    try {
      const res = await apiFetch(`/api/channels/${channelId}`);
      if (res.status === 404) {
        setChannel(null);
        return;
      }
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
      const res = await apiFetch(url);
      if (res.status === 404) {
        // Fail silently
        return;
      }
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
      const res = await apiFetch(url);
      if (res.status === 404) {
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      setStreamingAgents((prev) => {
        const merged = { ...prev };
        for (const [agentId, serverStream] of Object.entries(data.streamingAgents || {})) {
          const s = serverStream as StreamingAgentState;
          if (merged[agentId]) {
            merged[agentId] = {
              ...s,
              text: merged[agentId].text.length > s.text.length ? merged[agentId].text : s.text,
              thinking: (merged[agentId].thinking?.length || 0) > (s.thinking?.length || 0) ? merged[agentId].thinking : s.thinking,
              toolCalls: { ...s.toolCalls, ...merged[agentId].toolCalls }};
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

  const recoverDurableStreaming = useCallback(async () => {
    if (!channelId) return;
    try {
      const executionsResponse = await apiFetch(`/api/channels/${channelId}/executions?limit=50`);
      if (!executionsResponse.ok) return;
      const data = await executionsResponse.json() as { executions?: ChannelExecution[] };
      const execution = data.executions?.find((item) =>
        item.status === "running" && (!sessionId || item.sessionId === sessionId)
      );
      if (!execution) return;
      const eventsResponse = await apiFetch(`/api/channels/${channelId}/executions/${execution.id}/events?limit=1000`);
      if (!eventsResponse.ok) return;
      const eventData = await eventsResponse.json() as { events?: ChannelExecutionEvent[] };
      setStreamingAgents(() => {
        executionViewRef.current = (eventData.events ?? []).reduce(applyChannelExecutionEvent, emptyChannelExecutionViewState);
        return executionViewRef.current.agents;
      });
    } catch (err) {
      console.error("Failed to recover durable channel streaming:", err);
    }
  }, [channelId, sessionId]);

  useEffect(() => {
    if (!channelId) {
      setChannel(null);
      setMessages([]);
      setStreamingAgents({});
      setLoading(false);
      prevChannelIdRef.current = null;
      return;
    }

    if (prevChannelIdRef.current !== channelId) {
      setMessages([]);
      setStreamingAgents({});
      setLoading(true);
      setError(null);
    }
    prevChannelIdRef.current = channelId;

    Promise.all([fetchChannel(), fetchMessages(), fetchActiveStreamings(), recoverDurableStreaming()]).finally(() => setLoading(false));
  }, [channelId, sessionId, fetchChannel, fetchMessages, fetchActiveStreamings, recoverDurableStreaming]);

  useConnectionAwareEffect(() => {
    if (!channelId) return;
    wsClient.send({ type: "channel_join", channelId });
    void fetchActiveStreamings();
    void recoverDurableStreaming();
  }, [channelId, fetchActiveStreamings, recoverDurableStreaming]);

  useEffect(() => {
    if (!channelId) return;

    const unsubMessage = wsClient.subscribe("*", (rawData: unknown) => {
      const data = rawData as Record<string, any>;

      if (data.channelId && data.channelId !== channelIdRef.current) return;
      if (sessionIdRef.current && data.sessionId && data.sessionId !== sessionIdRef.current) return;

      if (data.type === "channel_message") {
        const newMsg: ChannelMessage = data.message;
        setMessages((prev) => {
          if (prev.some((m) => m.id === newMsg.id)) return prev;
          if (sessionIdRef.current && newMsg.sessionId !== sessionIdRef.current) return prev;
          return [...prev, newMsg];
        });
      } else if (data.type === "channel_execution_event" && data.event) {
        executionViewRef.current = applyChannelExecutionEvent(executionViewRef.current, data.event as ChannelExecutionEvent);
        setStreamingAgents(executionViewRef.current.agents);
      } else if (data.type === "channel_agent_start") {
        setStreamingAgents((prev) => ({
          ...prev,
          [data.agentId]: { agentId: data.agentId, agentName: data.agentName, text: "" }}));
      } else if (data.type === "channel_agent_token") {
        setStreamingAgents((prev) => {
          const current = prev[data.agentId] || { agentId: data.agentId, text: "" };
          const newText = data.fullText !== undefined ? data.fullText : (current.text + data.token);
          return { ...prev, [data.agentId]: { ...current, text: newText } };
        });
      } else if (data.type === "channel_agent_thinking") {
        setStreamingAgents((prev) => {
          const current = prev[data.agentId] || { agentId: data.agentId, text: "" };
          const newThinking = data.fullThinking !== undefined ? data.fullThinking : ((current.thinking || "") + data.token);
          return { ...prev, [data.agentId]: { ...current, thinking: newThinking } };
        });
      } else if (data.type === "channel_agent_tool_start") {
        setStreamingAgents((prev) => {
          const current = prev[data.agentId] || { agentId: data.agentId, text: "" };
          const tools = { ...(current.toolCalls || {}) };
          tools[data.toolCallId] = { toolName: data.toolName, args: data.args, result: null, isError: false };
          return { ...prev, [data.agentId]: { ...current, toolCalls: tools } };
        });
      } else if (data.type === "channel_agent_tool_update") {
        setStreamingAgents((prev) => {
          const current = prev[data.agentId] || { agentId: data.agentId, text: "" };
          const tools = { ...(current.toolCalls || {}) };
          if (tools[data.toolCallId]) {
            tools[data.toolCallId] = {
              ...tools[data.toolCallId],
              result: {
                toolName: data.toolName,
                content: [{ type: "text", text: String(data.partialResult ?? "") }],
                isPartial: true,
              },
            };
          }
          return { ...prev, [data.agentId]: { ...current, toolCalls: tools } };
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
                isError: data.isError},
              isError: data.isError};
          }
          return { ...prev, [data.agentId]: { ...current, toolCalls: tools } };
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
    });

    return unsubMessage;
  }, [channelId]);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!channelId || !content.trim()) return;
      const sent = wsClient.send({ type: "channel_send", channelId, sessionId, message: content });
      if (!sent) {
        await apiFetch(`/api/channels/${channelId}/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json"},
          body: JSON.stringify({ message: content, sessionId })});
      }
    },
    [channelId, sessionId]
  );

  const abortDispatch = useCallback(async () => {
    if (!channelId) return;
    setStreamingAgents({});
    const sent = wsClient.send({ type: "channel_abort", channelId, sessionId });
    if (!sent) {
      await apiFetch(`/api/channels/${channelId}/abort`, {
        method: "POST",
        headers: { "Content-Type": "application/json"},
        body: JSON.stringify({ sessionId })});
    }
  }, [channelId, sessionId]);

  const addMember = useCallback(
    async (data: AddMember) => {
      if (!channelId) return;
      const res = await apiFetch(`/api/channels/${channelId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json"},
        body: JSON.stringify(data)});
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
      const res = await apiFetch(`/api/channels/${channelId}/members/${agentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json"},
        body: JSON.stringify(data)});
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const updated = await res.json();
      setChannel(updated);
    },
    [channelId]
  );

  const removeMember = useCallback(
    async (agentId: string) => {
      if (!channelId) return;
      const res = await apiFetch(`/api/channels/${channelId}/members/${agentId}`, {
        method: "DELETE"});
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const updated = await res.json();
      setChannel(updated);
    },
    [channelId]
  );

  const updateChannel = useCallback(
    async (data: UpdateChannel) => {
      if (!channelId) return;
      const res = await apiFetch(`/api/channels/${channelId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json"},
        body: JSON.stringify(data)});
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
    recoverDurableStreaming,
    sendMessage,
    abortDispatch,
    updateChannel,
    addMember,
    updateMember,
    removeMember};
}
