import { apiFetch } from "@/lib/api";
import { useState, useCallback, useEffect } from "react";
import { useTeam } from "@/hooks/useTeam";
import { TeamMessageList } from "./TeamMessageList";
import { ChatInput } from "@/components/chat/ChatInput";
import type { MentionTarget } from "@/components/chat/ChatInput";
import { TeamMembersModal } from "./TeamMembersModal";
import { TeamSettingsModal } from "./TeamSettingsModal";
import { useNavigate } from "react-router-dom";
import { getSessionPath } from "@/lib/session-utils";
import { ChatArea } from "@/components/chat/ChatArea";
import type { TeamMember, AgentInfo } from "shared";

interface Props {
  activeTeam: { id: string; name: string };
  sessionId: string | null;
}

export function TeamChatArea({ activeTeam, sessionId }: Props) {
  const { team, messages, streamingAgents, sendMessage, abortDispatch, updateTeam, fetchTeam } = useTeam(activeTeam.id, sessionId);
  const navigate = useNavigate();

  const isStreaming = Object.keys(streamingAgents).length > 0;
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [registeredAgents, setRegisteredAgents] = useState<AgentInfo[]>([]);

  const mentionTargets: MentionTarget[] = [
    { id: "__user__", name: "user" },
    ...teamMembers.map((m) => ({
      id: m.agentId,
      name: registeredAgents.find((a) => a.id === m.agentId)?.name || m.agentId})),
  ];

  const loadTeamDetails = useCallback(async () => {
    try {
      const [tRes, agRes] = await Promise.all([
        apiFetch(`/api/teams/${activeTeam.id}`),
        apiFetch("/api/agents"),
      ]);
      if (tRes.ok) {
        const data = await tRes.json();
        setTeamMembers(data.members || []);
      }
      if (agRes.ok) {
        const data = await agRes.json();
        setRegisteredAgents(data.agents || []);
      }
    } catch {}
  }, [activeTeam.id]);

  useEffect(() => {
    loadTeamDetails();
  }, [loadTeamDetails]);

  const handleAddMember = async (data: TeamMember) => {
    await apiFetch(`/api/teams/${activeTeam.id}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json"},
      body: JSON.stringify(data)});
    await loadTeamDetails();
    await fetchTeam();
  };

  const handleUpdateMember = async (agentId: string, data: Partial<TeamMember>) => {
    await apiFetch(`/api/teams/${activeTeam.id}/members/${agentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json"},
      body: JSON.stringify(data)});
    await loadTeamDetails();
    await fetchTeam();
  };

  const handleRemoveMember = async (agentId: string) => {
    await apiFetch(`/api/teams/${activeTeam.id}/members/${agentId}`, {
      method: "DELETE"});
    await loadTeamDetails();
    await fetchTeam();
  };

  const handleOpenSubagentConsole = (toolCallId: string, targetType?: string, targetId?: string) => {
    const prefix = targetType === "delegate" || targetType === "channel" || targetType === "agent" || targetType === "project" || targetType === "session" ? "del" : "sub";
    const subSessionId = `${prefix}_${toolCallId}`;

    let context: any = { activeTeam };

    if (targetType && targetId) {
      context = {
        activeTeam: targetType === "channel" ? { id: targetId, name: "" } : null, // channels fall back to channel routing if needed
        activeAgent: targetType === "agent" ? { id: targetId, name: "" } : null,
        activeProjectName: targetType === "project" ? targetId : null,
      };
    }

    navigate(getSessionPath(subSessionId, context));
  };

  const handleSend = (text: string) => {
    if (!text.trim()) return;
    sendMessage(text.trim());
  };

  const leadMember = teamMembers.find((m) => m.role === "lead");
  const leadAgent = leadMember ? registeredAgents.find((a) => a.id === leadMember.agentId) : null;

  if (team?.teamType === "Orchestration" || (sessionId && sessionId.startsWith("team_"))) {
    return (
      <ChatArea
        sessionId={sessionId}
        activeProjectName={null}
        activeTeam={activeTeam}
      />
    );
  }

  const agentAvatarMap = registeredAgents.reduce((acc, agent) => {
    if (agent.id && agent.avatarUrl) {
      acc[agent.id] = agent.avatarUrl;
    }
    return acc;
  }, {} as Record<string, string>);

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-hidden relative">
      {/* Sub-header */}
      <div className="h-10 px-4 border-b border-border/60 flex items-center justify-between flex-shrink-0 bg-card/20 text-xs text-muted-foreground">
        <div className="flex items-center gap-2 truncate">
          <span className="font-semibold text-foreground flex items-center gap-1">
            <span className="text-primary font-bold">#</span>
            {team?.name || activeTeam.name}
          </span>
          {team?.description && (
            <>
              <span className="text-surface-hover">|</span>
              <span className="truncate hidden sm:inline">{team.description}</span>
            </>
          )}
          {leadAgent && (
            <>
              <span className="text-surface-hover">|</span>
              <span className="text-primary font-medium truncate">Lead: @{leadAgent.name}</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowMembersModal(true)}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-card-hover transition-colors relative"
            title={`Miembros (${team?.members?.length ?? 0} agentes)`}
          >
            <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
              <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
            </svg>
            {(team?.members?.length ?? 0) > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-card-hover text-foreground border border-input font-bold text-xs rounded-full flex items-center justify-center">
                {team?.members?.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setShowSettingsModal(true)}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-card-hover transition-colors"
            title={`Ajustes del equipo (MAX_ROUNDS: ${team?.maxRounds ?? 5})`}
          >
            <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </div>

      {/* Messages area */}
      <>
        <TeamMessageList
          messages={messages}
          streamingAgents={streamingAgents}
          mentionNames={["user", ...teamMembers.map((m) => registeredAgents.find((a) => a.id === m.agentId)?.name || m.agentId)]}
          sessionId={sessionId}
          activeTeamId={activeTeam.id}
          onOpenSubagentConsole={handleOpenSubagentConsole}
          agentAvatarMap={agentAvatarMap}
        />

        {sessionId && (
          <ChatInput
            sessionId={sessionId}
            streaming={isStreaming}
            onSend={(msg) => handleSend(msg)}
            onAbort={abortDispatch}
            mentionTargets={mentionTargets}
            activeChannelId={activeTeam.id} // We reuse activeChannelId prop so it binds correctly in ChatInput
          />
        )}
      </>

      {showMembersModal && (
        <TeamMembersModal
          teamName={team?.name || activeTeam.name}
          members={teamMembers}
          registeredAgents={registeredAgents}
          onClose={() => setShowMembersModal(false)}
          onAddMember={handleAddMember}
          onUpdateMember={handleUpdateMember}
          onRemoveMember={handleRemoveMember}
        />
      )}

      {showSettingsModal && team && (
        <TeamSettingsModal
          team={team}
          onClose={() => setShowSettingsModal(false)}
          onSave={async (updates) => {
            await updateTeam(updates);
          }}
        />
      )}
    </div>
  );
}
