import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import type { AgentInfo, AddMember, ReplyMode, ChannelRole } from "shared";
import { useLiterals } from "@/lib";
import { literals as u } from "./AddMemberModal.literals";
import { AgentAvatar } from "@/components/shared/AgentAvatar";
import { Dropdown } from "@/components/ui/Dropdown";
import { ROLE_OPTIONS } from "@/lib/dropdown-options";

interface Props {
  availableAgents: AgentInfo[];
  currentMemberAgentIds: string[];
  onClose: () => void;
  onAdd: (data: AddMember) => Promise<void>;
  hasLeader?: boolean;
}

export function AddMemberModal({ availableAgents, currentMemberAgentIds, onClose, onAdd, hasLeader = false }: Props) {
const l = useLiterals(u);
  const candidates = availableAgents.filter((a) => !currentMemberAgentIds.includes(a.id));

  const [selectedAgentId, setSelectedAgentId] = useState(candidates[0]?.id || "");
  const [replyMode, setReplyMode] = useState<ReplyMode>("user-only");
  const [targetAgentIds, setTargetAgentIds] = useState<string[]>([]);
  const [role, setRole] = useState<ChannelRole>("member");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (role === "lead") {
      setReplyMode("broadcast");
    }
  }, [role]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAgentId) return;
    setError(null);
    setSubmitting(true);
    try {
      await onAdd({
        agentId: selectedAgentId,
        replyMode,
        targetAgentIds: replyMode === "targeted" ? targetAgentIds : undefined,
        role,
      });
      onClose();
    } catch (err: any) {
      setError(err.message || l.addError);
    } finally {
      setSubmitting(false);
    }
  };

  const toggleTarget = (id: string) => {
    setTargetAgentIds((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );
  };

  const roleOptions = ROLE_OPTIONS.map((o) => ({
    ...o,
    disabled: o.value === "lead" ? hasLeader : false,
  }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 8 }}
        transition={{ duration: 0.18 }}
        className="relative w-full max-w-md bg-card border border-input rounded-2xl shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-input">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Add Agent to Channel</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Configure agent behavior in this channel</p>
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
              All registered agents are already in this channel.
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
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-left transition-colors cursor-pointer ${
                        selectedAgentId === a.id
                          ? "bg-primary/15 border border-primary/30 text-foreground"
                          : "border border-transparent text-muted-foreground hover:bg-card-hover hover:text-foreground"
                      }`}
                    >
                      <AgentAvatar name={a.name} avatarUrl={a.avatarUrl} size="xs" />
                      <span className="truncate">{a.name}</span>
                      <span className="text-muted-foreground ml-auto flex-shrink-0">({a.role})</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1.5">Channel Role</label>
                <Dropdown<ChannelRole>
                  value={role}
                  onChange={setRole}
                  options={roleOptions}
                  matchWidth
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1.5">Reply Mode</label>
                <div className="grid grid-cols-2 gap-2">
                  {(["user-only", "broadcast", "targeted", "mention-only"] as ReplyMode[]).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setReplyMode(mode)}
                      className={`py-2 px-2 rounded-lg border text-xs font-medium capitalize transition-colors ${
                        replyMode === mode
                          ? "bg-primary/15 border-primary/40 text-primary"
                          : "bg-background border-input text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground mt-1.5 leading-normal">
                  {replyMode === "user-only" && l.replyModeUserOnly}
                  {replyMode === "broadcast" && l.replyModeBroadcast}
                  {replyMode === "targeted" && l.replyModeTargeted}
                  {replyMode === "mention-only" && l.replyModeMentionOnly}
                </p>
              </div>

              {replyMode === "targeted" && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1.5">Target Agents to Trigger</label>
                  <div className="space-y-1.5 max-h-36 overflow-y-auto bg-background p-2 rounded-lg border border-input">
                    {availableAgents.map((a) => (
                      <label key={a.id} className="flex items-center gap-2 text-xs text-foreground cursor-pointer hover:bg-card/50 p-1 rounded">
                        <input
                          type="checkbox"
                          checked={targetAgentIds.includes(a.id)}
                          onChange={() => toggleTarget(a.id)}
                          className="rounded border-input text-primary focus:ring-primary/50"
                        />
                        <AgentAvatar name={a.name} avatarUrl={a.avatarUrl} size="xs" />
                        <span>{a.name} ({a.role})</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {error && (
                <div className="bg-destructive/10 border border-error/30 text-destructive text-xs px-3 py-2 rounded-lg">
                  {error}
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-2 text-sm font-medium text-muted-foreground border border-input rounded-lg hover:bg-card-hover transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !selectedAgentId}
                  className="flex-1 py-2 text-sm font-medium bg-primary text-background rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {submitting ? l.adding : l.addToChannel}
                </button>
              </div>
            </>
          )}
        </form>
      </motion.div>
    </div>
  );
}
