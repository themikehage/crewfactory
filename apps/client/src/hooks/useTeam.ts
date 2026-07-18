import { useState, useEffect, useCallback, useRef } from "react";
import { apiFetch } from "@/lib/api";
import { wsClient } from "@/lib/ws-client";
import { useConnectionAwareEffect } from "./useConnectionAware";
import type { TeamDefinition, TeamSession, TeamMessage, TeamRun, TeamEvent } from "shared";

export interface StreamingAgentState {
  agentId: string;
  agentName?: string;
  text: string;
  thinking?: string;
  toolCalls?: Record<string, { toolName: string; args: unknown; result: unknown; isError: boolean; isPartial?: boolean }>;
}

export function useTeam(teamId: string | null, sessionId?: string | null) {
  const [team, setTeam] = useState<TeamDefinition | null>(null);
  const [sessions, setSessions] = useState<TeamSession[]>([]);
  const [messages, setMessages] = useState<TeamMessage[]>([]);
  const [streamingAgents, setStreamingAgents] = useState<Record<string, StreamingAgentState>>({});
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const teamIdRef = useRef(teamId);
  const sessionIdRef = useRef(sessionId);
  const lastSequenceRef = useRef(0);
  const prevTeamIdRef = useRef<string | null>(null);
  teamIdRef.current = teamId;
  sessionIdRef.current = sessionId;

  const fetchTeam = useCallback(async () => {
    if (!teamId) return;
    try {
      const res = await apiFetch(`/api/teams/${teamId}`);
      if (!res.ok) return;
      setTeam(await res.json());
    } catch {}
  }, [teamId]);

  const fetchSessions = useCallback(async () => {
    if (!teamId) return;
    try {
      const res = await apiFetch(`/api/teams/${teamId}/sessions`);
      if (!res.ok) return;
      const data = await res.json();
      setSessions(data.sessions ?? []);
    } catch {}
  }, [teamId]);

  const fetchMessages = useCallback(async () => {
    if (!teamId || !sessionId) return;
    try {
      const res = await apiFetch(`/api/teams/${teamId}/sessions/${sessionId}/messages?limit=100`);
      if (!res.ok) return;
      const data = await res.json();
      setMessages(data.messages ?? []);
    } catch {}
  }, [teamId, sessionId]);

  const recoverActiveRun = useCallback(async () => {
    if (!teamId || !sessionId) return;
    try {
      const res = await apiFetch(`/api/teams/${teamId}/runs/active?sessionId=${sessionId}`);
      if (!res.ok) return;
      const data = await res.json();
      const run: TeamRun | null = data.run;
      if (!run) {
        setActiveRunId(null);
        setStreamingAgents({});
        return;
      }
      const isActive = run.status === "pending" || run.status === "running";
      setActiveRunId(isActive ? run.id : null);
      if (isActive) {
        const evRes = await apiFetch(`/api/teams/${teamId}/runs/${run.id}/events?afterSequence=0&limit=500`);
        if (!evRes.ok) return;
        const evData = await evRes.json();
        const events: TeamEvent[] = evData.events ?? [];
        if (events.length > 0) {
          lastSequenceRef.current = events[events.length - 1].sequence;
          const agentStates: Record<string, StreamingAgentState> = {};
          for (const evt of events) {
            applyEventToState(evt, agentStates);
          }
          setStreamingAgents(agentStates);
        }
      }
    } catch {}
  }, [teamId, sessionId]);

  useEffect(() => {
    if (!teamId) {
      setTeam(null); setMessages([]); setStreamingAgents({}); setActiveRunId(null);
      setLoading(false); prevTeamIdRef.current = null; return;
    }
    if (prevTeamIdRef.current !== teamId) {
      setMessages([]); setStreamingAgents({}); setActiveRunId(null); setLoading(true); setError(null);
      lastSequenceRef.current = 0;
    }
    prevTeamIdRef.current = teamId;
    Promise.all([fetchTeam(), fetchSessions(), fetchMessages(), recoverActiveRun()]).finally(() => setLoading(false));
  }, [teamId, sessionId, fetchTeam, fetchSessions, fetchMessages, recoverActiveRun]);

  useConnectionAwareEffect(() => {
    if (!teamId) return;
    wsClient.send({ type: "team_join", teamId });
    if (sessionId) {
      void fetchMessages();
      void recoverActiveRun();
    }
  }, [teamId, sessionId, fetchMessages, recoverActiveRun]);

  useEffect(() => {
    if (!teamId) return;
    const unsub = wsClient.subscribe("*", (rawData: unknown) => {
      const data = rawData as Record<string, any>;
      if (data.teamId && data.teamId !== teamIdRef.current) return;
      if (sessionIdRef.current && data.sessionId && data.sessionId !== sessionIdRef.current) return;

      if (data.sequence && data.sequence > lastSequenceRef.current) {
        lastSequenceRef.current = data.sequence;
      }

      if (data.type === "run_started") {
        setActiveRunId(data.runId as string);
        setStreamingAgents({});
        return;
      }
      if (data.type === "run_completed" || data.type === "run_aborted" || data.type === "run_failed") {
        setActiveRunId((cur) => (cur === data.runId ? null : cur));
        setStreamingAgents({});
        return;
      }
      if (data.type === "turn_started") {
        setStreamingAgents((prev) => ({
          ...prev,
          [data.agentId as string]: { agentId: data.agentId, agentName: data.agentName, text: "" },
        }));
        return;
      }
      if (data.type === "turn_completed") {
        const msg: TeamMessage = {
          id: crypto.randomUUID(),
          role: "agent",
          content: (data.payload as any)?.content ?? "",
          agentId: data.agentId,
          agentName: data.agentName,
          createdAt: new Date().toISOString(),
        };
        setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
        setStreamingAgents((prev) => {
          const next = { ...prev };
          delete next[data.agentId as string];
          return next;
        });
        return;
      }
      if (data.type === "token") {
        setStreamingAgents((prev) => {
          const cur = prev[data.agentId as string] ?? { agentId: data.agentId, agentName: data.agentName, text: "" };
          const newText = data.payload?.fullText !== undefined ? String(data.payload.fullText) : cur.text + String(data.payload?.delta ?? "");
          return { ...prev, [data.agentId as string]: { ...cur, text: newText } };
        });
        return;
      }
      if (data.type === "thinking") {
        setStreamingAgents((prev) => {
          const cur = prev[data.agentId as string] ?? { agentId: data.agentId, text: "" };
          return { ...prev, [data.agentId as string]: { ...cur, thinking: (cur.thinking ?? "") + String(data.payload?.delta ?? "") } };
        });
        return;
      }
      if (data.type === "tool_start") {
        setStreamingAgents((prev) => {
          const cur = prev[data.agentId as string] ?? { agentId: data.agentId, text: "" };
          const tools = { ...(cur.toolCalls ?? {}) };
          tools[data.toolCallId as string] = { toolName: data.payload?.toolName as string, args: data.payload?.args, result: null, isError: false };
          return { ...prev, [data.agentId as string]: { ...cur, toolCalls: tools } };
        });
        return;
      }
      if (data.type === "tool_update") {
        setStreamingAgents((prev) => {
          const cur = prev[data.agentId as string] ?? { agentId: data.agentId, text: "" };
          const tools = { ...(cur.toolCalls ?? {}) };
          const existing = tools[data.toolCallId as string];
          if (existing) tools[data.toolCallId as string] = { ...existing, result: { content: [{ type: "text", text: String(data.payload?.partialResult ?? "") }], isPartial: true }, isPartial: true };
          return { ...prev, [data.agentId as string]: { ...cur, toolCalls: tools } };
        });
        return;
      }
      if (data.type === "tool_end") {
        setStreamingAgents((prev) => {
          const cur = prev[data.agentId as string] ?? { agentId: data.agentId, text: "" };
          const tools = { ...(cur.toolCalls ?? {}) };
          if (tools[data.toolCallId as string]) {
            tools[data.toolCallId as string] = { ...tools[data.toolCallId as string], result: data.payload?.result, isError: Boolean(data.payload?.isError) };
          }
          return { ...prev, [data.agentId as string]: { ...cur, toolCalls: tools } };
        });
        return;
      }
    });
    return unsub;
  }, [teamId]);

  const sendTask = useCallback(
    (task: string) => {
      if (!teamId || !sessionId) return;
      wsClient.send({ type: "team_task", teamId, sessionId, task });
      const userMsg: TeamMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: task,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg]);
    },
    [teamId, sessionId]
  );

  const abort = useCallback(() => {
    if (!teamId || !sessionId) return;
    wsClient.send({ type: "team_abort", teamId, sessionId });
  }, [teamId, sessionId]);

  const createSession = useCallback(
    async (name: string): Promise<TeamSession> => {
      const res = await apiFetch(`/api/teams/${teamId}/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error("Failed to create session");
      const sess: TeamSession = await res.json();
      setSessions((prev) => [sess, ...prev]);
      return sess;
    },
    [teamId]
  );

  const session = sessions.find((s) => s.id === sessionId) ?? null;

  return {
    team,
    session,
    sessions,
    messages,
    streamingAgents,
    activeRunId,
    loading,
    error,
    sendTask,
    abort,
    createSession,
    refetchSessions: fetchSessions,
  };
}

function applyEventToState(evt: TeamEvent, agentStates: Record<string, StreamingAgentState>): void {
  if (evt.type === "turn_started" && evt.agentId) {
    agentStates[evt.agentId] = { agentId: evt.agentId, agentName: evt.agentName, text: "" };
  }
  if (evt.type === "token" && evt.agentId) {
    const cur = agentStates[evt.agentId] ?? { agentId: evt.agentId, text: "" };
    agentStates[evt.agentId] = { ...cur, text: String((evt.payload?.fullText as string) ?? cur.text + String(evt.payload?.delta ?? "")) };
  }
  if (evt.type === "turn_completed" && evt.agentId) {
    delete agentStates[evt.agentId];
  }
}
