import { useState, useMemo } from "react";
import { useChannel } from "@/hooks/useChannel";
import { useAgents } from "@/hooks/useAgents";
import { ChannelMessages } from "@/components/channels/ChannelMessages";
import { ChannelInput } from "@/components/channels/ChannelInput";
import { MembersPanel } from "@/components/channels/MembersPanel";
import { AddMemberModal } from "@/components/channels/AddMemberModal";
import { ChannelOrgTab } from "@/components/channels/ChannelOrgTab";
import { useLiterals } from "@/lib";
import { literals as u } from "./ChannelDetailPage.literals";

interface Props {
  channelId: string;
  onNavigate: (path: string) => void;
}

export function ChannelDetailPage({ channelId, onNavigate }: Props) {
  const l = useLiterals(u);
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

  const [activeTab, setActiveTab] = useState<"chat" | "org">("chat");
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

  if (error || !channel) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-background text-destructive gap-3">
        <p className="text-sm font-medium">{error || "Channel not found"}</p>
        <button
          onClick={() => onNavigate("/channels")}
          className="px-4 py-2 text-xs bg-card border border-input text-foreground rounded-lg hover:bg-card-hover transition-colors"
        >
          {l.backToChannels}
        </button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden relative">
      {/* Header */}
      <div className="h-12 px-4 border-b border-border flex items-center justify-between flex-shrink-0 bg-card/50 backdrop-blur-sm z-10">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={() => onNavigate("/channels")}
            className="p-1 text-muted-foreground hover:text-foreground rounded transition-colors"
            title={l.backToChannels}
          >
            <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          </button>
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-primary font-bold text-base select-none">#</span>
            <h2 className="text-sm font-semibold text-foreground truncate">{channel.name}</h2>
          </div>
          {channel.description && (
            <>
              <span className="text-muted-foreground select-none hidden sm:inline">|</span>
              <span className="text-xs text-muted-foreground truncate hidden sm:inline max-w-xs">{channel.description}</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          {activeTab === "chat" && (
            <button
              onClick={() => setShowMembersSidebar((prev) => !prev)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                showMembersSidebar
                  ? "bg-primary/10 border-primary/30 text-primary"
                  : "bg-card border-input text-muted-foreground hover:text-foreground"
              }`}
            >
              <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
              </svg>
              <span>Agents ({channel.members.length})</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabs Sub-Header */}
      <div className="h-10 px-4 border-b border-border/40 flex items-center justify-between flex-shrink-0 bg-card/10 text-xs">
        <div className="flex items-center gap-1.5 bg-background border border-input rounded-lg p-0.5">
          <button
            onClick={() => setActiveTab("chat")}
            className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
              activeTab === "chat"
                ? "bg-card text-foreground border border-input/60 shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {l.chat}
          </button>
          <button
            onClick={() => setActiveTab("org")}
            className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
              activeTab === "org"
                ? "bg-card text-foreground border border-input/60 shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {l.orgChart}
          </button>
        </div>
      </div>

      {/* Main Body */}
      <div className="flex-1 flex min-h-0 relative overflow-hidden">
        {activeTab === "org" ? (
          <ChannelOrgTab
            channelId={channelId}
            members={channel.members}
            registeredAgents={registeredAgents}
            streamingAgents={streamingAgents}
            onAddMemberClick={() => setShowAddMemberModal(true)}
            onUpdateMember={updateMember}
            onRemoveMember={removeMember}
          />
        ) : (
          <>
            <div className="flex-1 flex flex-col min-w-0 h-full">
              <ChannelMessages messages={messages} streamingAgents={streamingAgents} agentAvatarMap={agentAvatarMap} />
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
          </>
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

