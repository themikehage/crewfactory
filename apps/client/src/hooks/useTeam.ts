import { apiFetch } from "@/lib/api";
import { useState, useEffect, useCallback, useRef } from "react";
import type { Team, TeamMessage, TeamMember, UpdateTeam } from "shared";
import { wsClient } from "@/lib/ws-client";
import { useConnectionAwareEffect } from "./useConnectionAware";

export interface StreamingAgentState {
  agentId: string;
  agentName?: string;
  text: string;
  thinking?: string;
  toolCalls?: Record<string, { toolName: string; args: any; result: any | null; isError: boolean }>;
}

export function useTeam(teamId: string | null, sessionId?: string | null) {
  const [team, setTeam] = useState<Team | null>(null);
  const [messages, setMessages] = useState<TeamMessage[]>([]);
  const [streamingAgents, setStreamingAgents] = useState<Record<string, StreamingAgentState>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const teamIdRef = useRef(teamId);
  const sessionIdRef = useRef(sessionId);
  const prevTeamIdRef = useRef<string | null>(null);
  teamIdRef.current = teamId;
  sessionIdRef.current = sessionId;

  const fetchTeam = useCallback(async () => {
    if (!teamId) return;
    try {
      const res = await apiFetch(`/api/teams/${teamId}`);
      if (res.status === 404) {
        setTeam(null);
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setTeam(data);
    } catch (err: any) {
      setError(err.message || "Failed to load team");
    }
  }, [teamId]);

  const fetchMessages = useCallback(async () => {
    if (!teamId) return;
    try {
      const url = `/api/teams/${teamId}/messages?limit=100${sessionId ? `&sessionId=${sessionId}` : ""}`;
      const res = await apiFetch(url);
      if (res.status === 404) {
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setMessages(data.messages || []);
    } catch (err: any) {
      console.error("Failed to load team messages:", err);
    }
  }, [teamId, sessionId]);

  const fetchActiveStreamings = useCallback(async () => {
    if (!teamId) return;
    try {
      const url = `/api/teams/${teamId}/active-streamings${sessionId ? `?sessionId=${sessionId}` : ""}`;
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
      console.error("Failed to load active team streamings:", err);
    }
  }, [teamId, sessionId]);

  useEffect(() => {
    if (!teamId) {
      setTeam(null);
      setMessages([]);
      setStreamingAgents({});
      setLoading(false);
      prevTeamIdRef.current = null;
      return;
    }

    if (prevTeamIdRef.current !== teamId) {
      setMessages([]);
      setStreamingAgents({});
      setLoading(true);
      setError(null);
    }
    prevTeamIdRef.current = teamId;

    Promise.all([fetchTeam(), fetchMessages(), fetchActiveStreamings()]).finally(() => setLoading(false));
  }, [teamId, sessionId, fetchTeam, fetchMessages, fetchActiveStreamings]);

  useConnectionAwareEffect(() => {
    if (!teamId) return;
    wsClient.send({ type: "team_join", teamId });
  }, [teamId]);

  useEffect(() => {
    if (!teamId) return;

    const unsubMessage = wsClient.subscribe("*", (rawData: unknown) => {
      const data = rawData as Record<string, any>;

      if (data.teamId && data.teamId !== teamIdRef.current) return;
      if (sessionIdRef.current && data.sessionId && data.sessionId !== sessionIdRef.current) return;

      if (data.type === "team_message") {
        const newMsg: TeamMessage = data.message;
        setMessages((prev) => {
          if (prev.some((m) => m.id === newMsg.id)) return prev;
          if (sessionIdRef.current && newMsg.sessionId !== sessionIdRef.current) return prev;
          return [...prev, newMsg];
        });
      } else if (data.type === "team_agent_start") {
        setStreamingAgents((prev) => ({
          ...prev,
          [data.agentId]: { agentId: data.agentId, agentName: data.agentName, text: "" }}));
      } else if (data.type === "team_agent_token") {
        setStreamingAgents((prev) => {
          const current = prev[data.agentId] || { agentId: data.agentId, text: "" };
          const newText = data.fullText !== undefined ? data.fullText : (current.text + data.token);
          return { ...prev, [data.agentId]: { ...current, text: newText } };
        });
      } else if (data.type === "team_agent_thinking") {
        setStreamingAgents((prev) => {
          const current = prev[data.agentId] || { agentId: data.agentId, text: "" };
          const newThinking = data.fullThinking !== undefined ? data.fullThinking : ((current.thinking || "") + data.token);
          return { ...prev, [data.agentId]: { ...current, thinking: newThinking } };
        });
      } else if (data.type === "team_agent_tool_start") {
        setStreamingAgents((prev) => {
          const current = prev[data.agentId] || { agentId: data.agentId, text: "" };
          const tools = { ...(current.toolCalls || {}) };
          tools[data.toolCallId] = { toolName: data.toolName, args: data.args, result: null, isError: false };
          return { ...prev, [data.agentId]: { ...current, toolCalls: tools } };
        });
      } else if (data.type === "team_agent_tool_end") {
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
      } else if (data.type === "team_agent_end" || data.type === "team_agent_error") {
        setStreamingAgents((prev) => {
          const next = { ...prev };
          delete next[data.agentId];
          return next;
        });
      } else if (data.type === "team_dispatch_aborted" || data.type === "team_chain_limit") {
        setStreamingAgents({});
      }
    });

    return unsubMessage;
  }, [teamId]);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!teamId || !content.trim()) return;
      const sent = wsClient.send({ type: "team_send", teamId, sessionId, message: content });
      if (!sent) {
        await apiFetch(`/api/teams/${teamId}/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json"},
          body: JSON.stringify({ message: content, sessionId })});
      }
    },
    [teamId, sessionId]
  );

  const abortDispatch = useCallback(async () => {
    if (!teamId) return;
    setStreamingAgents({});
    const sent = wsClient.send({ type: "team_abort", teamId, sessionId });
    if (!sent) {
      await apiFetch(`/api/teams/${teamId}/abort`, {
        method: "POST",
        headers: { "Content-Type": "application/json"},
        body: JSON.stringify({ sessionId })});
    }
  }, [teamId, sessionId]);

  const addMember = useCallback(
    async (data: TeamMember) => {
      if (!teamId) return;
      const res = await apiFetch(`/api/teams/${teamId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json"},
        body: JSON.stringify(data)});
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed to add member" }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const updated = await res.json();
      setTeam(updated);
    },
    [teamId]
  );

  const updateMember = useCallback(
    async (agentId: string, data: Partial<TeamMember>) => {
      if (!teamId) return;
      const res = await apiFetch(`/api/teams/${teamId}/members/${agentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json"},
        body: JSON.stringify(data)});
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const updated = await res.json();
      setTeam(updated);
    },
    [teamId]
  );

  const removeMember = useCallback(
    async (agentId: string) => {
      if (!teamId) return;
      const res = await apiFetch(`/api/teams/${teamId}/members/${agentId}`, {
        method: "DELETE"});
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const updated = await res.json();
      setTeam(updated);
    },
    [teamId]
  );

  const updateTeam = useCallback(
    async (data: UpdateTeam) => {
      if (!teamId) return;
      const res = await apiFetch(`/api/teams/${teamId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json"},
        body: JSON.stringify(data)});
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const updated = await res.json();
      setTeam(updated);
    },
    [teamId]
  );

  return {
    team,
    messages,
    streamingAgents,
    loading,
    error,
    fetchTeam,
    sendMessage,
    abortDispatch,
    updateTeam,
    addMember,
    updateMember,
    removeMember};
}
