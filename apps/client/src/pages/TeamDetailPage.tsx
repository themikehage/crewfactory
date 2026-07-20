import { useState, useMemo } from "react";
import { useTeam } from "@/hooks/useTeam";
import { useAgents } from "@/hooks/useAgents";
import { TeamMessages } from "@/components/teams/TeamMessages";
import { TeamInput } from "@/components/teams/TeamInput";
import { TeamMembersPanel } from "@/components/teams/TeamMembersPanel";
import { AddTeamMemberModal } from "@/components/teams/TeamMembersModal";
import { useLiterals } from "@/lib";
import { literals as u } from "./TeamDetailPage.literals";
import { EntityAvatar } from "@/components/shared/EntityAvatar";

interface Props {
  teamId: string;
  onNavigate: (path: string) => void;
}

export function TeamDetailPage({ teamId, onNavigate }: Props) {
  const l = useLiterals(u);
  const {
    team,
    messages,
    streamingAgents,
    loading,
    error,
    sendMessage,
    addMember,
    updateMember,
    removeMember,
  } = useTeam(teamId);

  const { agents: registeredAgents } = useAgents();

  const [showMembersSidebar, setShowMembersSidebar] = useState(true);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);

  const agentAvatarMap = useMemo(() => {
    const map: Record<string, string | undefined> = {};
    for (const a of registeredAgents) {
      map[a.id] = a.avatarUrl;
    }
    return map;
  }, [registeredAgents]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-background">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !team) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-background text-destructive gap-3">
        <p className="text-sm font-medium">{error || "Team not found"}</p>
        <button
          onClick={() => onNavigate("/teams")}
          className="px-4 py-2 text-xs bg-card border border-input text-foreground rounded-lg hover:bg-card-hover transition-colors cursor-pointer"
        >
          {l.backToTeams}
        </button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden relative font-sans">
      {/* Header */}
      <div className="h-12 px-4 border-b border-border flex items-center justify-between flex-shrink-0 bg-card/50 backdrop-blur-sm z-10">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={() => onNavigate("/teams")}
            className="p-1 text-muted-foreground hover:text-foreground rounded transition-colors cursor-pointer"
            title={l.backToTeams}
          >
            <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          </button>
          <div className="flex items-center gap-1.5 min-w-0">
            <EntityAvatar
              name={team.name}
              avatarUrl={team.avatarUrl}
              size="xs"
              type="team"
            />
            <h2 className="text-sm font-semibold text-foreground truncate">{team.name}</h2>
          </div>
          {team.description && (
            <>
              <span className="text-muted-foreground select-none hidden sm:inline">|</span>
              <span className="text-xs text-muted-foreground truncate hidden sm:inline max-w-xs">{team.description}</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowMembersSidebar((prev) => !prev)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                showMembersSidebar
                  ? "bg-primary/10 border-primary/30 text-primary"
                  : "bg-card border-input text-muted-foreground hover:text-foreground"
              }`}
            >
              <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
              </svg>
              <span>Agents ({team.members?.length || 0})</span>
            </button>
        </div>
      </div>

      <div className="flex-1 flex min-h-0 relative overflow-hidden">
        <div className="flex-1 flex flex-col min-w-0 h-full">
          <TeamMessages messages={messages} streamingAgents={streamingAgents} agentAvatarMap={agentAvatarMap} />
          <TeamInput onSend={sendMessage} />
        </div>

        {showMembersSidebar && (
          <TeamMembersPanel
            members={team.members || []}
            registeredAgents={registeredAgents}
            onAddClick={() => setShowAddMemberModal(true)}
            onUpdateMember={updateMember}
            onRemoveMember={removeMember}
          />
        )}
      </div>

      {showAddMemberModal && (
        <AddTeamMemberModal
          availableAgents={registeredAgents}
          currentMemberAgentIds={(team.members || []).map((m) => m.agentId)}
          onClose={() => setShowAddMemberModal(false)}
          onAdd={addMember}
          hasLeader={(team.members || []).some((m) => m.role === "lead")}
          literals={l}
        />
      )}
    </div>
  );
}
