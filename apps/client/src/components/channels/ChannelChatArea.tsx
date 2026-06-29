import { useState, useCallback, useEffect } from "react";
import { useChannel } from "@/hooks/useChannel";
import { ChannelMessageList } from "./ChannelMessageList";
import { InputArea } from "@/components/chat/InputArea";
import { ChannelMembersModal } from "./ChannelMembersModal";
import { ChannelContextModal } from "./ChannelContextModal";
import type { ChannelMember, AgentInfo, AddMember, UpdateMember, ChannelContextItem } from "shared";

interface Props {
  activeChannel: { id: string; name: string };
  sessionId: string | null;
}

export function ChannelChatArea({ activeChannel, sessionId }: Props) {
  const { channel, messages, streamingAgents, sendMessage, fetchChannel } = useChannel(activeChannel.id);
  const isStreaming = Object.keys(streamingAgents).length > 0;
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [showContextModal, setShowContextModal] = useState(false);
  const [channelMembers, setChannelMembers] = useState<ChannelMember[]>([]);
  const [registeredAgents, setRegisteredAgents] = useState<AgentInfo[]>([]);

  const loadChannelDetails = useCallback(async () => {
    const token = localStorage.getItem("token");
    try {
      const [chRes, agRes] = await Promise.all([
        fetch(`/api/channels/${activeChannel.id}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/agents", { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (chRes.ok) {
        const data = await chRes.json();
        setChannelMembers(data.members || data.channel?.members || []);
      }
      if (agRes.ok) {
        const data = await agRes.json();
        setRegisteredAgents(data.agents || []);
      }
    } catch {}
  }, [activeChannel.id]);

  useEffect(() => {
    if (showMembersModal) {
      loadChannelDetails();
    }
  }, [showMembersModal, loadChannelDetails]);

  const handleAddMember = async (data: AddMember) => {
    const token = localStorage.getItem("token");
    await fetch(`/api/channels/${activeChannel.id}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    });
    await loadChannelDetails();
    await fetchChannel();
  };

  const handleUpdateMember = async (agentId: string, data: UpdateMember) => {
    const token = localStorage.getItem("token");
    await fetch(`/api/channels/${activeChannel.id}/members/${agentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    });
    await loadChannelDetails();
    await fetchChannel();
  };

  const handleRemoveMember = async (agentId: string) => {
    const token = localStorage.getItem("token");
    await fetch(`/api/channels/${activeChannel.id}/members/${agentId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    await loadChannelDetails();
    await fetchChannel();
  };

  const handleSaveContext = async (context: ChannelContextItem[]) => {
    const token = localStorage.getItem("token");
    await fetch(`/api/channels/${activeChannel.id}/context`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ context }),
    });
    await fetchChannel();
  };

  const handleSend = (text: string) => {
    if (!text.trim()) return;
    sendMessage(text.trim());
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-bg overflow-hidden relative">
      {/* Sub-header for channel info and quick actions */}
      <div className="h-10 px-4 border-b border-surface/60 flex items-center justify-between flex-shrink-0 bg-surface/20 text-xs text-text-secondary">
        <div className="flex items-center gap-2 truncate">
          <span className="font-semibold text-text-primary flex items-center gap-1">
            <span className="text-accent font-bold">#</span>
            {channel?.name || activeChannel.name}
          </span>
          {channel?.description && (
            <>
              <span className="text-surface-hover">|</span>
              <span className="truncate hidden sm:inline">{channel.description}</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowContextModal(true)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-400/10 text-blue-400 border border-blue-400/20 hover:bg-blue-400/20 transition-colors font-medium"
            title="Gestionar variables de contexto del canal"
          >
            <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
            </svg>
            <span>Contexto ({channel?.context?.length ?? 0})</span>
          </button>

          <button
            onClick={() => setShowMembersModal(true)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-purple-400/10 text-purple-400 border border-purple-400/20 hover:bg-purple-400/20 transition-colors font-medium"
            title="Gestionar miembros del canal"
          >
            <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
              <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
            </svg>
            <span>Miembros ({channel?.members?.length ?? 0})</span>
          </button>
        </div>
      </div>

      {/* Messages area specialized for multi-agent channels */}
      <ChannelMessageList messages={messages} streamingAgents={streamingAgents} />

      {/* Reused InputArea shared with normal chat */}
      <div className="p-3 sm:p-4 border-t border-surface/60 bg-surface/10 flex-shrink-0">
        <InputArea
          sessionId={sessionId}
          streaming={isStreaming}
          onSend={(msg) => handleSend(msg)}
          onAbort={() => {}}
        />
      </div>

      {showMembersModal && (
        <ChannelMembersModal
          channelName={channel?.name || activeChannel.name}
          members={channelMembers}
          registeredAgents={registeredAgents}
          onClose={() => setShowMembersModal(false)}
          onAddMember={handleAddMember}
          onUpdateMember={handleUpdateMember}
          onRemoveMember={handleRemoveMember}
        />
      )}

      {showContextModal && (
        <ChannelContextModal
          channelName={channel?.name || activeChannel.name}
          context={channel?.context || []}
          onClose={() => setShowContextModal(false)}
          onSave={handleSaveContext}
        />
      )}
    </div>
  );
}
