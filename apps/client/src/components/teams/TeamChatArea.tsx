import { useState, useEffect, useCallback, useMemo } from "react";
import { useTeam } from "@/hooks/useTeam";
import { TeamMessageList } from "./TeamMessageList";
import { TeamRunProgress } from "./TeamRunProgress";
import { TeamMembersBar } from "./TeamMembersBar";
import { ChatInput } from "@/components/chat/ChatInput";
import { apiFetch } from "@/lib/api";

interface Props {
  activeTeamId: string;
  sessionId: string | null;
}

export function TeamChatArea({ activeTeamId, sessionId }: Props) {
  const { team, messages, streamingAgents, activeRunId, loading, sendTask, abort } = useTeam(
    activeTeamId,
    sessionId
  );

  const [registeredAgents, setRegisteredAgents] = useState<Array<{ id: string; name: string; avatarUrl?: string }>>([]);

  const isStreaming = Object.keys(streamingAgents).length > 0;

  const loadAgents = useCallback(async () => {
    try {
      const res = await apiFetch("/api/agents");
      if (res.ok) {
        const data = await res.json();
        setRegisteredAgents(data.agents || []);
      }
    } catch {}
  }, []);

  useEffect(() => {
    loadAgents();
  }, [loadAgents]);

  const agentMap = useMemo(() => {
    const map: Record<string, { name: string; avatarUrl?: string }> = {};
    for (const a of registeredAgents) {
      map[a.id] = { name: a.name, avatarUrl: a.avatarUrl };
    }
    return map;
  }, [registeredAgents]);

  const agentAvatarMap = useMemo(() => {
    const map: Record<string, string | undefined> = {};
    for (const a of registeredAgents) {
      map[a.id] = a.avatarUrl;
    }
    return map;
  }, [registeredAgents]);

  const activeAgentIds = useMemo(() => {
    return new Set(Object.keys(streamingAgents));
  }, [streamingAgents]);

  if (loading || !team) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background text-text-secondary text-xs">
        Loading Team...
      </div>
    );
  }

  const mentionTargets = [
    { id: "__user__", name: "user" },
    ...team.members.map((m) => ({
      id: m.agentId,
      name: agentMap[m.agentId]?.name || m.agentId,
    })),
  ];

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-hidden relative">
      {/* Sub-header */}
      <div className="h-12 px-4 border-b border-border/60 flex items-center justify-between flex-shrink-0 bg-card/20 text-xs">
        <div className="flex items-center gap-2 truncate">
          <span className="font-semibold text-text-primary text-sm flex items-center gap-1.5">
            <span className="text-accent font-bold">@</span>
            {team.name}
          </span>
          {team.description && (
            <>
              <span className="text-white/10">|</span>
              <span className="truncate text-text-secondary text-xs">{team.description}</span>
            </>
          )}
        </div>

        <TeamMembersBar team={team} agents={agentMap} activeAgentIds={activeAgentIds} />
      </div>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-h-0 bg-bg relative">
        <TeamMessageList
          messages={messages}
          streamingAgents={streamingAgents}
          sessionId={sessionId}
          agentAvatarMap={agentAvatarMap}
        />

        {/* Live execution progress */}
        <TeamRunProgress team={team} streamingAgents={streamingAgents} activeRunId={activeRunId} />

        {/* Input */}
        {sessionId && (
          <div className="flex-shrink-0">
            <ChatInput
              sessionId={sessionId}
              streaming={isStreaming || activeRunId !== null}
              onSend={sendTask}
              onAbort={abort}
              mentionTargets={mentionTargets}
              activeChannelId={activeTeamId} // Reuse activeChannelId prop so it knows which scope it's at
            />
          </div>
        )}
      </div>
    </div>
  );
}
