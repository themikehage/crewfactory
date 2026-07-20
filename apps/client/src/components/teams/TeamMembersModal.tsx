import { useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import type { TeamMember, AgentInfo, TeamRole } from "shared";
import { useLiterals } from "@/lib";
import { literals as u } from "./TeamMembersModal.literals";
import { Dropdown } from "@/components/ui/Dropdown";
import { AgentAvatar } from "@/components/shared/AgentAvatar";

const TEAM_ROLE_OPTIONS: { value: TeamRole; label: string }[] = [
  { value: "lead", label: "Lead" },
  { value: "member", label: "Member" },
  { value: "observer", label: "Observer" },
];

const OUTPUT_MODE_OPTIONS: { value: "normal" | "full-proposal" | "diff-suggestion"; label: string }[] = [
  { value: "normal", label: "Normal" },
  { value: "full-proposal", label: "Full Proposal" },
  { value: "diff-suggestion", label: "Diff Suggestion" },
];

interface Props {
  teamName: string;
  members: TeamMember[];
  registeredAgents: AgentInfo[];
  onClose: () => void;
  onAddMember: (data: TeamMember) => Promise<void>;
  onUpdateMember: (agentId: string, data: Partial<TeamMember>) => Promise<void>;
  onRemoveMember: (agentId: string) => Promise<void>;
}

export function TeamMembersModal({
  teamName,
  members,
  registeredAgents,
  onClose,
  onAddMember,
  onUpdateMember,
  onRemoveMember,
}: Props) {
  const l = useLiterals(u);
  const [showAddModal, setShowAddModal] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const getAgentInfo = (agentId: string) => {
    return registeredAgents.find((a) => a.id === agentId);
  };

  const getRoleOptions = (currentMemberId: string, currentRole: TeamRole) => {
    const otherHasLeader = members.some((m) => m.role === "lead" && m.agentId !== currentMemberId);
    return TEAM_ROLE_OPTIONS.map((o) => {
      let disabled = false;
      if (o.value === "lead") {
        disabled = otherHasLeader;
      } else {
        disabled = currentRole === "lead" && !otherHasLeader;
      }
      return {
        ...o,
        disabled,
      };
    });
  };

  const handleRoleChange = async (agentId: string, role: TeamRole) => {
    setUpdatingId(agentId);
    try {
      await onUpdateMember(agentId, { role });
    } finally {
      setUpdatingId(null);
    }
  };

  const handleOutputModeChange = async (agentId: string, outputMode: "full-proposal" | "diff-suggestion" | "normal") => {
    setUpdatingId(agentId);
    try {
      await onUpdateMember(agentId, { outputMode });
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
        className="relative w-full max-w-2xl bg-card border border-input rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-input flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-primary font-bold text-base">#</span>
            <div>
              <h2 className="text-sm font-semibold text-foreground">{l.title} de #{teamName}</h2>
              <p className="text-xs text-muted-foreground">{l.subtitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAddModal(true)}
              className="px-3 py-1.5 text-xs font-medium bg-primary text-background rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-1 cursor-pointer"
            >
              <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
              </svg>
              <span>{l.addAgent}</span>
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-card-hover transition-colors">
              <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-input text-muted-foreground font-medium uppercase tracking-wider">
                  <th className="py-2.5">{l.addAgent}</th>
                  <th className="py-2.5">{l.role}</th>
                  <th className="py-2.5">{l.outputMode}</th>
                  <th className="py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-input/50">
                {members.map((m) => {
                  const info = getAgentInfo(m.agentId);
                  const isUpdating = updatingId === m.agentId;
                  return (
                    <tr key={m.agentId} className={isUpdating ? "opacity-60 pointer-events-none" : ""}>
                      <td className="py-3 flex items-center gap-2">
                        <AgentAvatar name={info?.name || m.agentId} avatarUrl={info?.avatarUrl} size="xs" />
                        <div>
                          <p className="font-semibold text-foreground">{info?.name || m.agentId}</p>
                          <p className="text-[10px] text-muted-foreground font-mono truncate max-w-[140px]">{m.agentId}</p>
                        </div>
                      </td>
                      <td className="py-3">
                        <Dropdown<TeamRole>
                          value={m.role || "member"}
                          onChange={(val) => handleRoleChange(m.agentId, val)}
                          options={getRoleOptions(m.agentId, m.role || "member")}
                          size="xs"
                        />
                      </td>
                      <td className="py-3">
                        <Dropdown<"full-proposal" | "diff-suggestion" | "normal">
                          value={m.outputMode || "normal"}
                          onChange={(val) => handleOutputModeChange(m.agentId, val)}
                          options={OUTPUT_MODE_OPTIONS}
                          size="xs"
                        />
                      </td>
                      <td className="py-3 text-right">
                        <button
                          onClick={() => onRemoveMember(m.agentId)}
                          disabled={m.role === "lead"}
                          className="px-2 py-1 bg-destructive/10 border border-error/25 hover:bg-destructive/20 text-destructive text-[11px] font-medium rounded transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {l.remove}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </motion.div>

      <AnimatePresence>
        {showAddModal && createPortal(
          <AddTeamMemberModal
            availableAgents={registeredAgents}
            currentMemberAgentIds={members.map((m) => m.agentId)}
            onClose={() => setShowAddModal(false)}
            onAdd={onAddMember}
            hasLeader={members.some((m) => m.role === "lead")}
            literals={l}
          />,
          document.body
        )}
      </AnimatePresence>
    </div>
  );
}

interface AddProps {
  availableAgents: AgentInfo[];
  currentMemberAgentIds: string[];
  onClose: () => void;
  onAdd: (data: TeamMember) => Promise<void>;
  hasLeader: boolean;
  literals: Record<string, string>;
}

export function AddTeamMemberModal({ availableAgents, currentMemberAgentIds, onClose, onAdd, hasLeader, literals }: AddProps) {
  const candidates = availableAgents.filter((a) => !currentMemberAgentIds.includes(a.id));

  const [selectedAgentId, setSelectedAgentId] = useState(candidates[0]?.id || "");
  const [role, setRole] = useState<TeamRole>("member");
  const [outputMode, setOutputMode] = useState<"full-proposal" | "diff-suggestion" | "normal">("normal");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAgentId) return;
    setError(null);
    setSubmitting(true);
    try {
      await onAdd({
        agentId: selectedAgentId,
        role,
        outputMode,
      });
      onClose();
    } catch (err: any) {
      setError(err.message || literals.addError);
    } finally {
      setSubmitting(false);
    }
  };

  const roleOptions = TEAM_ROLE_OPTIONS.map((o) => ({
    ...o,
    disabled: o.value === "lead" ? hasLeader : false,
  }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fadeIn" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 8 }}
        transition={{ duration: 0.18 }}
        className="relative w-full max-w-md bg-card border border-input rounded-2xl shadow-2xl overflow-hidden z-10"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-input">
          <div>
            <h2 className="text-sm font-semibold text-foreground">{literals.addAgent}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Configure agent behavior in this team</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-card-hover transition-colors">
            <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          {candidates.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              {literals.noAgents}
            </p>
          ) : (
            <>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1.5">Select Agent</label>
                <div className="space-y-1 max-h-40 overflow-y-auto bg-background p-2 rounded-lg border border-input">
                  {candidates.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => setSelectedAgentId(a.id)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-left transition-colors cursor-pointer ${
                        selectedAgentId === a.id
                          ? "bg-primary/15 border border-primary/30 text-foreground"
                          : "border border-transparent text-muted-foreground hover:bg-card-hover hover:text-foreground"
                      }`}
                    >
                      <AgentAvatar name={a.name} avatarUrl={a.avatarUrl} size="xs" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1.5">
                          <span className="font-semibold text-foreground truncate">{a.name}</span>
                          <span className="text-[10px] text-muted-foreground truncate font-mono">@{a.id}</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground truncate mt-0.5">{a.role}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1.5">{literals.role}</label>
                <Dropdown<TeamRole>
                  value={role}
                  onChange={setRole}
                  options={roleOptions}
                  matchWidth
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1.5">{literals.outputMode}</label>
                <Dropdown<"full-proposal" | "diff-suggestion" | "normal">
                  value={outputMode}
                  onChange={setOutputMode}
                  options={OUTPUT_MODE_OPTIONS}
                  matchWidth
                />
              </div>

              {error && (
                <div className="bg-destructive/10 border border-error/30 text-destructive text-xs px-3 py-2 rounded-lg animate-shake">
                  {error}
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-2 text-sm font-medium text-muted-foreground border border-input rounded-lg hover:bg-card-hover transition-colors cursor-pointer"
                >
                  {literals.cancel}
                </button>
                <button
                  type="submit"
                  disabled={submitting || !selectedAgentId}
                  className="flex-1 py-2 text-sm font-medium bg-primary text-background rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {submitting ? literals.adding : literals.addToTeam}
                </button>
              </div>
            </>
          )}
        </form>
      </motion.div>
    </div>
  );
}
