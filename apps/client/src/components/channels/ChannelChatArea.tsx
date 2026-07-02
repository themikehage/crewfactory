import { useState, useCallback, useEffect } from "react";
import { useChannel } from "@/hooks/useChannel";
import { ChannelMessageList } from "./ChannelMessageList";
import { InputArea } from "@/components/chat/InputArea";
import type { MentionTarget } from "@/components/chat/InputArea";
import { ChannelMembersModal } from "./ChannelMembersModal";
import { ChannelContextModal } from "./ChannelContextModal";
import { ChannelSettingsModal } from "./ChannelSettingsModal";
import { ChannelOrgChart } from "./ChannelOrgChart";
import { ChannelTaskLedger } from "./ChannelTaskLedger";
import { ChannelBenchmarkPanel } from "./ChannelBenchmarkPanel";
import { ChannelOptimizePanel } from "./ChannelOptimizePanel";
import { BenchmarkLiveTab } from "./BenchmarkLiveTab";
import type { ChannelMember, AgentInfo, AddMember, UpdateMember, ChannelContextItem } from "shared";

interface Props {
  activeChannel: { id: string; name: string };
  sessionId: string | null;
}

export function ChannelChatArea({ activeChannel, sessionId }: Props) {
  const { channel, messages, streamingAgents, sendMessage, abortDispatch, updateChannel, fetchChannel } = useChannel(activeChannel.id, sessionId);
  const isStreaming = Object.keys(streamingAgents).length > 0;
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [showContextModal, setShowContextModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [channelMembers, setChannelMembers] = useState<ChannelMember[]>([]);
  const [registeredAgents, setRegisteredAgents] = useState<AgentInfo[]>([]);
  const [viewMode, setViewMode] = useState<"chat" | "org" | "ledger" | "benchmark" | "optimize" | "benchmark_live">("chat");

  const mentionTargets: MentionTarget[] = [
    { id: "__user__", name: "user" },
    ...channelMembers.map((m) => ({
      id: m.agentId,
      name: registeredAgents.find((a) => a.id === m.agentId)?.name || m.agentId,
    })),
  ];

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

  // Load on mount so mentionTargets are available immediately
  useEffect(() => {
    loadChannelDetails();
  }, [loadChannelDetails]);

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

  const leadMember = channelMembers.find((m) => m.role === "lead");
  const leadAgent = leadMember ? registeredAgents.find((a) => a.id === leadMember.agentId) : null;

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
          {leadAgent && (
            <>
              <span className="text-surface-hover">|</span>
              <span className="text-accent font-medium truncate">Lead: @{leadAgent.name}</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-1">
          <div className="flex items-center gap-1 bg-bg border border-surface-hover rounded-lg p-0.5 mr-2">
            <button
              onClick={() => setViewMode("chat")}
              className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                viewMode === "chat"
                  ? "bg-surface text-text-primary border border-surface-hover/80"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              Chat
            </button>
            {channel?.benchmark?.enabled && (
              <button
                onClick={() => setViewMode("benchmark_live")}
                className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors relative ${
                  viewMode === "benchmark_live"
                    ? "bg-surface text-text-primary border border-surface-hover/80"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                Benchmark
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-accent animate-pulse" />
              </button>
            )}
            <button
              onClick={() => setViewMode("org")}
              className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                viewMode === "org"
                  ? "bg-surface text-text-primary border border-surface-hover/80"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              Org Chart
            </button>
            <button
              onClick={() => setViewMode("ledger")}
              className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                viewMode === "ledger"
                  ? "bg-surface text-text-primary border border-surface-hover/80"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              Tareas
            </button>
            <button
              onClick={() => setViewMode("optimize")}
              className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                viewMode === "optimize"
                  ? "bg-surface text-text-primary border border-surface-hover/80"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              Optimizar
            </button>
          </div>

          <button
            onClick={() => setShowContextModal(true)}
            className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors relative"
            title={`Contexto (${channel?.context?.length ?? 0} variables)`}
          >
            <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
            </svg>
            {(channel?.context?.length ?? 0) > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-accent text-bg font-bold text-[8px] rounded-full flex items-center justify-center">
                {channel?.context?.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setShowMembersModal(true)}
            className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors relative"
            title={`Miembros (${channel?.members?.length ?? 0} agentes)`}
          >
            <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
              <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
            </svg>
            {(channel?.members?.length ?? 0) > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-surface-hover text-text-primary border border-surface-hover font-bold text-[8px] rounded-full flex items-center justify-center">
                {channel?.members?.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setShowSettingsModal(true)}
            className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors"
            title={`Ajustes del canal (MAX_CHAIN_DEPTH: ${channel?.maxChainDepth ?? 5})`}
          >
            <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </div>

      {/* Messages area, Org Chart or Task Ledger */}
      {viewMode === "org" ? (
        <ChannelOrgChart
          members={channelMembers}
          registeredAgents={registeredAgents}
        />
      ) : viewMode === "ledger" ? (
        <ChannelTaskLedger
          channelId={activeChannel.id}
        />
      ) : viewMode === "benchmark_live" ? (
        <BenchmarkLiveTab
          channelId={activeChannel.id}
          channel={channel}
          sessionId={sessionId}
          channelMessages={messages.map((m) => `[${m.agentName || "agent"}]: ${m.content}`).join("\n\n")}
        />
      ) : viewMode === "benchmark" ? (
        <ChannelBenchmarkPanel
          channelId={activeChannel.id}
        />
      ) : viewMode === "optimize" ? (
        <ChannelOptimizePanel
          channelId={activeChannel.id}
        />
      ) : (
        <>
          <ChannelMessageList
            messages={messages}
            streamingAgents={streamingAgents}
            mentionNames={["user", ...channelMembers.map((m) => registeredAgents.find((a) => a.id === m.agentId)?.name || m.agentId)]}
            sessionId={sessionId}
            activeChannelId={activeChannel.id}
          />

          {/* Reused InputArea shared with normal chat */}
          <div className="p-3 sm:p-4 border-t border-surface/60 bg-surface/10 flex-shrink-0">
            <InputArea
              sessionId={sessionId}
              streaming={isStreaming}
              onSend={(msg) => handleSend(msg)}
              onAbort={abortDispatch}
              mentionTargets={mentionTargets}
              activeChannelId={activeChannel.id}
            />
          </div>
        </>
      )}

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

      {showSettingsModal && channel && (
        <ChannelSettingsModal
          channel={channel}
          onClose={() => setShowSettingsModal(false)}
          onSave={async (updates) => {
            await updateChannel(updates);
          }}
        />
      )}
    </div>
  );
}
