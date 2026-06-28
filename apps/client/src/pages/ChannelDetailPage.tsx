import { useState } from "react";
import { useChannel } from "@/hooks/useChannel";
import { useAgents } from "@/hooks/useAgents";
import { ChannelMessages } from "@/components/channels/ChannelMessages";
import { ChannelInput } from "@/components/channels/ChannelInput";
import { MembersPanel } from "@/components/channels/MembersPanel";
import { AddMemberModal } from "@/components/channels/AddMemberModal";

interface Props {
  channelId: string;
  onNavigate: (path: string) => void;
}

export function ChannelDetailPage({ channelId, onNavigate }: Props) {
  const {
    channel,
    messages,
    streamingAgents,
    loading,
    error,
    sendMessage,
    addMember,
    updateMember,
    removeMember,
  } = useChannel(channelId);

  const { agents: registeredAgents } = useAgents();

  const [showMembersSidebar, setShowMembersSidebar] = useState(true);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-bg">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !channel) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-bg text-error gap-3">
        <p className="text-sm font-medium">{error || "Channel not found"}</p>
        <button
          onClick={() => onNavigate("/channels")}
          className="px-4 py-2 text-xs bg-surface border border-surface-hover text-text-primary rounded-lg hover:bg-surface-hover transition-colors"
        >
          Back to Channels
        </button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-bg overflow-hidden relative">
      {/* Header */}
      <div className="h-12 px-4 border-b border-surface flex items-center justify-between flex-shrink-0 bg-surface/50 backdrop-blur-sm z-10">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={() => onNavigate("/channels")}
            className="p-1 text-text-secondary hover:text-text-primary rounded transition-colors"
            title="Back to Channels"
          >
            <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          </button>
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-accent font-bold text-base select-none">#</span>
            <h2 className="text-sm font-semibold text-text-primary truncate">{channel.name}</h2>
          </div>
          {channel.description && (
            <>
              <span className="text-text-secondary/40 select-none hidden sm:inline">|</span>
              <span className="text-xs text-text-secondary truncate hidden sm:inline max-w-xs">{channel.description}</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowMembersSidebar((prev) => !prev)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              showMembersSidebar
                ? "bg-accent/10 border-accent/30 text-accent"
                : "bg-surface border-surface-hover text-text-secondary hover:text-text-primary"
            }`}
          >
            <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
              <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
            </svg>
            <span>Agents ({channel.members.length})</span>
          </button>
        </div>
      </div>

      {/* Main Body */}
      <div className="flex-1 flex min-h-0 relative overflow-hidden">
        <div className="flex-1 flex flex-col min-w-0 h-full">
          <ChannelMessages messages={messages} streamingAgents={streamingAgents} />
          <ChannelInput onSend={sendMessage} />
        </div>

        {showMembersSidebar && (
          <MembersPanel
            members={channel.members}
            registeredAgents={registeredAgents}
            onAddClick={() => setShowAddMemberModal(true)}
            onUpdateMember={(agentId, replyMode) => updateMember(agentId, { replyMode })}
            onRemoveMember={removeMember}
          />
        )}
      </div>

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
