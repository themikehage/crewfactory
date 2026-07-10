import { useState } from "react";
import { useChannel } from "@/hooks/useChannel";
import { useAgents } from "@/hooks/useAgents";
import { ChannelOrgTab } from "@/components/channels/ChannelOrgTab";
import { AddMemberModal } from "@/components/channels/AddMemberModal";

interface Props {
  channelId: string;
  onNavigate: (path: string) => void;
}

export function ChannelOrgPage({ channelId, onNavigate }: Props) {
  const {
    channel,
    streamingAgents,
    loading,
    error,
    addMember,
    updateMember,
    removeMember,
  } = useChannel(channelId);

  const { agents: registeredAgents } = useAgents();

  const [showAddMemberModal, setShowAddMemberModal] = useState(false);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-background">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !channel) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-background text-destructive gap-3">
        <p className="text-sm font-medium">{error || "Channel not found"}</p>
        <button
          onClick={() => onNavigate("/channels")}
          className="px-4 py-2 text-xs bg-card border border-input text-foreground rounded-lg hover:bg-card-hover transition-colors"
        >
          Back to Channels
        </button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden">
      <ChannelOrgTab
        members={channel.members}
        registeredAgents={registeredAgents}
        streamingAgents={streamingAgents}
        onAddMemberClick={() => setShowAddMemberModal(true)}
        onUpdateMember={updateMember}
        onRemoveMember={removeMember}
      />

      {showAddMemberModal && (
        <AddMemberModal
          availableAgents={registeredAgents}
          currentMemberAgentIds={channel.members.map((m) => m.agentId)}
          onClose={() => setShowAddMemberModal(false)}
          onAdd={addMember}
        />
      )}
    </div>
  );
}
