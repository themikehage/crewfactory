import { useState } from "react";
import { useTeam } from "@/hooks/useTeam";
import { useAgents } from "@/hooks/useAgents";
import { TeamOrgTab } from "@/components/teams/TeamOrgTab";
import { AddTeamMemberModal } from "@/components/teams/TeamMembersModal";

interface Props {
  teamId: string;
  onNavigate: (path: string) => void;
}

export function TeamOrgPage({ teamId, onNavigate }: Props) {
  const {
    team,
    streamingAgents,
    loading,
    error,
    addMember,
    updateMember,
    removeMember,
  } = useTeam(teamId);

  const { agents: registeredAgents } = useAgents();

  const [showAddMemberModal, setShowAddMemberModal] = useState(false);

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
          className="px-4 py-2 text-xs bg-card border border-input text-foreground rounded-lg hover:bg-card-hover transition-colors"
        >
          Back to Teams
        </button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden">
      <TeamOrgTab
        members={team.members || []}
        registeredAgents={registeredAgents}
        streamingAgents={streamingAgents}
        onAddMemberClick={() => setShowAddMemberModal(true)}
        onUpdateMember={updateMember}
        onRemoveMember={removeMember}
      />

      {showAddMemberModal && (
        <AddTeamMemberModal
          availableAgents={registeredAgents}
          currentMemberAgentIds={(team.members || []).map((m) => m.agentId)}
          onClose={() => setShowAddMemberModal(false)}
          onAdd={addMember}
          hasLeader={(team.members || []).some((m) => m.role === "lead")}
          literals={{}} // Fallback, will load within modal or fallback to default
        />
      )}
    </div>
  );
}
