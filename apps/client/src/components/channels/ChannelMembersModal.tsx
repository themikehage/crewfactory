import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { ChannelMember, AgentInfo, ReplyMode, AddMember, UpdateMember, ChannelRole } from "shared";
import { AddMemberModal } from "./AddMemberModal";

interface Props {
  channelName: string;
  members: ChannelMember[];
  registeredAgents: AgentInfo[];
  onClose: () => void;
  onAddMember: (data: AddMember) => Promise<void>;
  onUpdateMember: (agentId: string, data: UpdateMember) => Promise<void>;
  onRemoveMember: (agentId: string) => Promise<void>;
}

export function ChannelMembersModal({
  channelName,
  members,
  registeredAgents,
  onClose,
  onAddMember,
  onUpdateMember,
  onRemoveMember,
}: Props) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingTargetsAgentId, setEditingTargetsAgentId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const getAgentInfo = (agentId: string) => {
    return registeredAgents.find((a) => a.id === agentId);
  };

  const handleModeChange = async (agentId: string, mode: ReplyMode) => {
    setUpdatingId(agentId);
    try {
      await onUpdateMember(agentId, { replyMode: mode });
    } finally {
      setUpdatingId(null);
    }
  };

  const handleRoleChange = async (agentId: string, role: ChannelRole) => {
    setUpdatingId(agentId);
    try {
      await onUpdateMember(agentId, { role });
    } finally {
      setUpdatingId(null);
    }
  };

  const toggleTarget = async (member: ChannelMember, targetId: string) => {
    const currentTargets = member.targetAgentIds || [];
    const updatedTargets = currentTargets.includes(targetId)
      ? currentTargets.filter((t) => t !== targetId)
      : [...currentTargets, targetId];

    setUpdatingId(member.agentId);
    try {
      await onUpdateMember(member.agentId, { targetAgentIds: updatedTargets });
    } finally {
      setUpdatingId(null);
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
        className="relative w-full max-w-xl bg-card border border-input rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-input flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-primary font-bold text-base">#</span>
            <div>
              <h2 className="text-sm font-semibold text-foreground">Miembros de #{channelName}</h2>
              <p className="text-xs text-muted-foreground">Gestiona los agentes y sus modos de respuesta</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAddModal(true)}
              className="px-3 py-1.5 text-xs font-medium bg-primary text-background rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-1"
            >
              <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
              </svg>
              Añadir Agente
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-card-hover transition-colors">
              <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3 min-h-0">
          {members.length === 0 && (
            <div className="text-center py-10 text-muted-foreground text-sm">
              No hay agentes en este canal. Haz click en "Añadir Agente" para comenzar.
            </div>
          )}

          {members.map((m) => {
            const info = getAgentInfo(m.agentId);
            const name = info?.name || m.agentId;
            const role = info?.role || "agente";
            const isEditingTargets = editingTargetsAgentId === m.agentId;

            return (
              <div
                key={m.agentId}
                className="bg-background border border-input rounded-xl p-4 flex flex-col gap-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-purple-400/10 border border-purple-400/20 flex items-center justify-center text-purple-400 font-bold text-xs flex-shrink-0">
                      AG
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-semibold text-foreground text-sm truncate">{name}</h4>
                      <p className="text-xs text-muted-foreground font-mono truncate">{role}</p>
                    </div>
                  </div>

                  <button
                    onClick={() => onRemoveMember(m.agentId)}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors text-xs flex items-center gap-1"
                    title="Remover agente del canal"
                  >
                    <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-input/50 items-start">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1">Reply Mode</label>
                    <select
                      disabled={updatingId === m.agentId}
                      value={m.replyMode}
                      onChange={(e) => handleModeChange(m.agentId, e.target.value as ReplyMode)}
                      className="w-full bg-card border border-input rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary/50 capitalize cursor-pointer"
                    >
                      <option value="user-only">User-only</option>
                      <option value="broadcast">Broadcast</option>
                      <option value="targeted">Targeted</option>
                      <option value="mention-only">Mention-only</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1">Role</label>
                    <select
                      disabled={updatingId === m.agentId}
                      value={m.role || "member"}
                      onChange={(e) => handleRoleChange(m.agentId, e.target.value as ChannelRole)}
                      className="w-full bg-card border border-input rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary/50 capitalize cursor-pointer"
                    >
                      <option value="lead">Lead</option>
                      <option value="senior">Senior</option>
                      <option value="member">Member</option>
                      <option value="observer">Observer</option>
                    </select>
                  </div>

                  {m.replyMode === "targeted" && (
                    <div className="sm:col-span-2">
                      <label className="text-xs font-medium text-muted-foreground block mb-1">Target Agents</label>
                      <button
                        type="button"
                        onClick={() => setEditingTargetsAgentId(isEditingTargets ? null : m.agentId)}
                        className="w-full py-1.5 px-2.5 bg-card border border-input rounded-lg text-xs font-medium text-primary hover:bg-primary/10 transition-colors flex items-center justify-between"
                      >
                        <span className="truncate">
                          {m.targetAgentIds && m.targetAgentIds.length > 0
                            ? `${m.targetAgentIds.length} agent(s) selected`
                            : "Select targets..."}
                        </span>
                        <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor" className={`transition-transform ${isEditingTargets ? "rotate-180" : ""}`}>
                          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>

                {m.replyMode === "targeted" && isEditingTargets && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="bg-card/60 border border-input/80 p-3 rounded-lg space-y-2 mt-1"
                  >
                    <p className="text-xs font-medium text-foreground">
                      Selecciona a cuáles agentes de este canal responderá {name}:
                    </p>
                    <div className="space-y-1.5 max-h-36 overflow-y-auto">
                      {registeredAgents
                        .filter((a) => a.id !== m.agentId)
                        .map((otherAgent) => {
                          const isTarget = m.targetAgentIds?.includes(otherAgent.id) ?? false;
                          return (
                            <label
                              key={otherAgent.id}
                              className="flex items-center justify-between p-2 rounded-lg bg-background/60 border border-input/40 hover:border-primary/30 cursor-pointer transition-colors"
                            >
                              <div className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={isTarget}
                                  onChange={() => toggleTarget(m, otherAgent.id)}
                                  disabled={updatingId === m.agentId}
                                  className="rounded border-input text-primary focus:ring-primary/50"
                                />
                                <span className="text-xs font-medium text-foreground">{otherAgent.name}</span>
                              </div>
                              <span className="text-[10px] text-muted-foreground font-mono">{otherAgent.role}</span>
                            </label>
                          );
                        })}
                    </div>
                  </motion.div>
                )}
              </div>
            );
          })}
        </div>
      </motion.div>

      <AnimatePresence>
        {showAddModal && (
          <AddMemberModal
            availableAgents={registeredAgents}
            currentMemberAgentIds={members.map((m) => m.agentId)}
            onClose={() => setShowAddModal(false)}
            onAdd={onAddMember}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
