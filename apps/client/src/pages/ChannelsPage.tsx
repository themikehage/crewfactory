import { apiFetch } from "@/lib/api";
import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useChannels } from "@/hooks/useChannels";
import { ChannelCard } from "@/components/channels/ChannelCard";
import { ChannelMembersModal } from "@/components/channels/ChannelMembersModal";
import { ChannelContextModal } from "@/components/channels/ChannelContextModal";
import { CHANNEL_TOPOLOGY_VERSION, type Channel, type ChannelMember, type ChannelTopologyKind, type AgentInfo, type AddMember, type UpdateMember, type CreateChannel, type ChannelContextItem } from "shared";
import { useLiterals } from "@/lib";
import { literals as u } from "./ChannelsPage.literals";
import { Button } from "@/components/ui/Button";

function CreateChannelModal({
  onClose,
  onCreate,
  availableAgents}: {
  onClose: () => void;
  onCreate: (data: CreateChannel) => Promise<void>;
  availableAgents: AgentInfo[];
}) {
  const l = useLiterals(u);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<Exclude<ChannelTopologyKind, "legacy_custom">>("leader_specialists");
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    setSubmitting(true);
    try {
      const members = selectedAgentIds.map((agentId, order) => ({ agentId, role: kind === "leader_specialists" || kind === "sequential_review" ? (order === 0 ? "lead" as const : "member" as const) : "member" as const, replyMode: kind === "mention_only" ? "mention-only" as const : "user-only" as const }));
      const assignments = selectedAgentIds.map((agentId, order) => ({ agentId, role: kind === "leader_specialists" || kind === "sequential_review" ? (order === 0 ? "leader" as const : kind === "leader_specialists" ? "specialist" as const : "reviewer" as const) : kind === "roundtable" ? "peer" as const : kind === "debate_with_arbiter" && order === selectedAgentIds.length - 1 ? "arbiter" as const : kind === "debate_with_arbiter" ? "position" as const : "participant" as const, targets: [], order }));
      const first = selectedAgentIds[0];
      const arbiter = assignments.find((assignment) => assignment.role === "arbiter")?.agentId;
      await onCreate({ name: name.trim(), description: description.trim() || undefined, members, topology: { version: CHANNEL_TOPOLOGY_VERSION, kind, schedulerMode: kind === "leader_specialists" ? "leader-gated" : "sequential", entryPointAgentId: kind === "roundtable" || kind === "mention_only" ? undefined : first, terminalOwnerAgentId: kind === "leader_specialists" ? first : kind === "debate_with_arbiter" ? arbiter : selectedAgentIds[selectedAgentIds.length - 1], arbiterAgentId: arbiter, assignments }, negotiationProtocol: kind === "debate_with_arbiter" ? { agreementPattern: "(AGREEMENT|ACUERDO)", maxRounds: 3, arbiterAgentId: arbiter } : undefined });
      onClose();
    } catch (err: any) {
      setError(err.message || l.createError);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 8 }}
        transition={{ duration: 0.18 }}
        className="relative w-full max-w-md bg-card border border-input rounded-2xl shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-input">
          <div>
            <h2 className="text-sm font-semibold text-foreground">{l.emptyButton}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Start a new multi-agent conversation space</p>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Team flow</label>
            <select value={kind} onChange={(event) => setKind(event.target.value as Exclude<ChannelTopologyKind, "legacy_custom">)} className="w-full bg-background border border-input rounded-lg px-3 py-2 text-sm text-foreground">
              <option value="leader_specialists">Leader & specialists</option><option value="sequential_review">Sequential review</option><option value="roundtable">Roundtable</option><option value="debate_with_arbiter">Debate with arbiter</option><option value="mention_only">Mention only</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Team members</label>
            <div className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-input p-2">{availableAgents.map((agent) => <label key={agent.id} className="flex items-center gap-2 text-xs text-foreground"><input type="checkbox" checked={selectedAgentIds.includes(agent.id)} onChange={(event) => setSelectedAgentIds((current) => event.target.checked ? [...current, agent.id] : current.filter((id) => id !== agent.id))} /><span>{agent.name}</span></label>)}</div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-card-hover transition-colors">
            <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">{l.channelNameLabel}</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={l.channelNamePlaceholder}
              className="w-full bg-background border border-input rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">{l.descriptionLabel}</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={l.descriptionPlaceholder}
              className="w-full bg-background border border-input rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
            />
          </div>

          {error && (
            <div className="bg-destructive/10 border border-error/30 text-destructive text-xs px-3 py-2 rounded-lg">
              {error}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <Button variant="outline" type="button" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || !name.trim() || selectedAgentIds.length === 0 || (kind === "debate_with_arbiter" && selectedAgentIds.length < 3)} className="flex-1">
              {submitting ? l.creating : l.createChannel}
            </Button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

interface Props {
  onNavigate: (path: string) => void;
  onSelectChannel?: (channel: { id: string; name: string }) => void;
}

export function ChannelsPage({ onNavigate, onSelectChannel }: Props) {
  const l = useLiterals(u);
  const { channels, loading, error, fetchChannels, createChannel, deleteChannel } = useChannels();
  const [showCreate, setShowCreate] = useState(false);
  const [managingChannel, setManagingChannel] = useState<Channel | null>(null);
  const [contextChannel, setContextChannel] = useState<Channel | null>(null);
  const [channelMembers, setChannelMembers] = useState<ChannelMember[]>([]);
  const [registeredAgents, setRegisteredAgents] = useState<AgentInfo[]>([]);

  useEffect(() => {
    apiFetch("/api/agents")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setRegisteredAgents(data.agents || []);
      })
      .catch(() => {});
  }, []);

  const loadChannelDetails = useCallback(async (channelId: string) => {
    try {
      const [chRes, agRes] = await Promise.all([
        apiFetch(`/api/channels/${channelId}`),
        apiFetch("/api/agents"),
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
  }, []);

  const handleOpenMembers = (channel: Channel) => {
    setManagingChannel(channel);
    setChannelMembers(channel.members || []);
    loadChannelDetails(channel.id);
  };

  const handleOpenContext = (channel: Channel) => {
    setContextChannel(channel);
  };

  const handleSaveContext = async (context: ChannelContextItem[]) => {
    if (!contextChannel) return;
    await apiFetch(`/api/channels/${contextChannel.id}/context`, {
      method: "PUT",
      headers: { "Content-Type": "application/json"},
      body: JSON.stringify({ context })});
    await fetchChannels();
  };

  const handleAddMember = async (data: AddMember) => {
    if (!managingChannel) return;
    await apiFetch(`/api/channels/${managingChannel.id}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json"},
      body: JSON.stringify(data)});
    await loadChannelDetails(managingChannel.id);
    await fetchChannels();
  };

  const handleUpdateMember = async (agentId: string, data: UpdateMember) => {
    if (!managingChannel) return;
    await apiFetch(`/api/channels/${managingChannel.id}/members/${agentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json"},
      body: JSON.stringify(data)});
    await loadChannelDetails(managingChannel.id);
    await fetchChannels();
  };

  const handleRemoveMember = async (agentId: string) => {
    if (!managingChannel) return;
    await apiFetch(`/api/channels/${managingChannel.id}/members/${agentId}`, {
      method: "DELETE"});
    await loadChannelDetails(managingChannel.id);
    await fetchChannels();
  };

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden">
      <div className="flex items-center justify-between px-6 py-5 border-b border-border flex-shrink-0">
        <div>
          <h1 className="text-base font-semibold text-foreground">{l.pageTitle}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {l.pageSubtitle}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchChannels}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-card-hover rounded-lg transition-colors"
            title={l.refresh}
          >
            <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
            </svg>
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary text-background rounded-lg hover:bg-primary/90 transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
            </svg>
            Create Channel
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        {loading && (
          <div className="flex items-center justify-center h-32">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!loading && error && (
          <div className="flex flex-col items-center justify-center h-32 text-destructive text-sm gap-2">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" className="opacity-60">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            {error}
          </div>
        )}

        {!loading && !error && channels.length === 0 && (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-3">
            <div className="w-12 h-12 rounded-2xl bg-card border border-input flex items-center justify-center">
              <span className="text-muted-foreground font-bold text-lg">#</span>
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">{l.emptyTitle}</p>
              <p className="text-xs mt-1">{l.emptyDescription}</p>
            </div>
            <button
              onClick={() => setShowCreate(true)}
              className="px-4 py-2 text-xs font-medium bg-primary/10 text-primary border border-primary/20 rounded-lg hover:bg-primary/20 transition-colors"
            >
              Create Channel
            </button>
          </div>
        )}

        {!loading && !error && channels.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <AnimatePresence mode="popLayout">
              {channels.map((ch) => (
                <ChannelCard
                  key={ch.id}
                  channel={ch}
                  registeredAgents={registeredAgents}
                  onOpen={(id) => {
                    if (onSelectChannel) {
                      onSelectChannel({ id: ch.id, name: ch.name });
                    } else {
                      onNavigate(`/channel/${id}`);
                    }
                  }}
                  onDelete={deleteChannel}
                  onManageMembers={handleOpenMembers}
                  onManageContext={handleOpenContext}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      <AnimatePresence>
        {showCreate && (
          <CreateChannelModal
            onClose={() => setShowCreate(false)}
            onCreate={async (data) => {
              const ch = await createChannel(data);
              if (onSelectChannel) {
                onSelectChannel({ id: ch.id, name: ch.name });
              } else {
                onNavigate(`/channel/${ch.id}`);
              }
            }}
            availableAgents={registeredAgents}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {managingChannel && (
          <ChannelMembersModal
            channelName={managingChannel.name}
            members={channelMembers}
            registeredAgents={registeredAgents}
            onClose={() => setManagingChannel(null)}
            onAddMember={handleAddMember}
            onUpdateMember={handleUpdateMember}
            onRemoveMember={handleRemoveMember}
            topologyManaged={managingChannel.topology?.kind !== undefined && managingChannel.topology.kind !== "legacy_custom"}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {contextChannel && (
          <ChannelContextModal
            channelName={contextChannel.name}
            context={contextChannel.context || []}
            onClose={() => setContextChannel(null)}
            onSave={handleSaveContext}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
