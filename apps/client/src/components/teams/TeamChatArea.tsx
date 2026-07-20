import { apiFetch } from "@/lib/api";
import { useState, useCallback, useEffect } from "react";
import { useTeam } from "@/hooks/useTeam";
import { TeamMessageList } from "./TeamMessageList";
import { ChatInput } from "@/components/chat/ChatInput";
import type { MentionTarget } from "@/components/chat/ChatInput";
import { TeamMembersModal } from "./TeamMembersModal";
import { useNavigate } from "react-router-dom";
import { getSessionPath } from "@/lib/session-utils";
import { ChatArea } from "@/components/chat/ChatArea";
import { TeamContextModal } from "./TeamContextModal";
import type { TeamMember, AgentInfo, TeamContextItem } from "shared";
import { EntityAvatar } from "@/components/shared/EntityAvatar";

interface Props {
  activeTeam: { id: string; name: string; avatarUrl?: string };
  sessionId: string | null;
  variantMode?: boolean;
}

export function TeamChatArea({ activeTeam, sessionId, variantMode = false }: Props) {
  const { team, messages, streamingAgents, sendMessage, abortDispatch, fetchTeam } = useTeam(activeTeam.id, sessionId);
  const navigate = useNavigate();

  const isStreaming = Object.keys(streamingAgents).length > 0;
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [showContextModal, setShowContextModal] = useState(false);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [registeredAgents, setRegisteredAgents] = useState<AgentInfo[]>([]);

  const handleSaveContext = async (context: TeamContextItem[]) => {
    await apiFetch(`/api/teams/${activeTeam.id}/context`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ context }),
    });
    await fetchTeam();
  };

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

    const handleEntityUpdate = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      if (detail?.type === "team") {
        loadTeamDetails();
        fetchTeam();
      }
    };

    window.addEventListener("entity-updated", handleEntityUpdate);
    return () => window.removeEventListener("entity-updated", handleEntityUpdate);
  }, [loadTeamDetails, fetchTeam]);

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
      if (activeTeam) {
        context = { activeTeam };
      } else {
        context = {
          activeChannel: targetType === "channel" ? { id: targetId, name: "" } : null,
          activeAgent: targetType === "agent" ? { id: targetId, name: "" } : null,
          activeProjectName: targetType === "project" ? targetId : null,
        };
      }
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
      <div className="flex-1 flex flex-col h-full bg-background overflow-hidden relative">
        {/* Sub-header */}
        {!variantMode && (
          <div className="h-10 px-4 border-b border-border/60 flex items-center justify-between flex-shrink-0 bg-card/20 text-xs text-muted-foreground">
            <div className="flex items-center gap-2 truncate">
              <span className="font-semibold text-foreground flex items-center gap-1">
                <EntityAvatar
                  name={team?.name || activeTeam.name}
                  avatarUrl={team?.avatarUrl || activeTeam.avatarUrl}
                  size="xs"
                  type="team"
                  className="mr-1"
                />
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
                onClick={() => setShowContextModal(true)}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-card-hover transition-colors relative"
                title={`Contexto (${team?.context?.length ?? 0} variables)`}
              >
                <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
                </svg>
                {(team?.context?.length ?? 0) > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-primary text-background font-bold text-xs rounded-full flex items-center justify-center">
                    {team?.context?.length}
                  </span>
                )}
              </button>

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
            </div>
          </div>
        )}

        {/* Content area */}
        <div className="flex-1 min-h-0 relative">
          <ChatArea
            sessionId={sessionId}
            activeProjectName={null}
            activeTeam={activeTeam}
          />
        </div>

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



        {showContextModal && (
          <TeamContextModal
            teamName={team?.name || activeTeam.name}
            context={team?.context || []}
            onClose={() => setShowContextModal(false)}
            onSave={handleSaveContext}
          />
        )}
      </div>
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
      {!variantMode && (
        <div className="h-10 px-4 border-b border-border/60 flex items-center justify-between flex-shrink-0 bg-card/20 text-xs text-muted-foreground">
          <div className="flex items-center gap-2 truncate">
            <span className="font-semibold text-foreground flex items-center gap-1">
              <EntityAvatar
                name={team?.name || activeTeam.name}
                avatarUrl={team?.avatarUrl || activeTeam.avatarUrl}
                size="xs"
                type="team"
                className="mr-1"
              />
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
              onClick={() => setShowContextModal(true)}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-card-hover transition-colors relative"
              title={`Contexto (${team?.context?.length ?? 0} variables)`}
            >
              <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
              </svg>
              {(team?.context?.length ?? 0) > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-primary text-background font-bold text-xs rounded-full flex items-center justify-center">
                  {team?.context?.length}
                </span>
              )}
            </button>

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


          </div>
        </div>
      )}

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

        {sessionId && !variantMode && (
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



      {showContextModal && (
        <TeamContextModal
          teamName={team?.name || activeTeam.name}
          context={team?.context || []}
          onClose={() => setShowContextModal(false)}
          onSave={handleSaveContext}
        />
      )}
    </div>
  );
}
