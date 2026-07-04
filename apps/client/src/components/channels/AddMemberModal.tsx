import { useState } from "react";
import { motion } from "framer-motion";
import type { AgentInfo, AddMember, ReplyMode, ChannelRole } from "shared";

interface Props {
  availableAgents: AgentInfo[];
  currentMemberAgentIds: string[];
  onClose: () => void;
  onAdd: (data: AddMember) => Promise<void>;
}

export function AddMemberModal({ availableAgents, currentMemberAgentIds, onClose, onAdd }: Props) {
  const candidates = availableAgents.filter((a) => !currentMemberAgentIds.includes(a.id));

  const [selectedAgentId, setSelectedAgentId] = useState(candidates[0]?.id || "");
  const [replyMode, setReplyMode] = useState<ReplyMode>("user-only");
  const [targetAgentIds, setTargetAgentIds] = useState<string[]>([]);
  const [role, setRole] = useState<ChannelRole>("member");
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
        replyMode,
        targetAgentIds: replyMode === "targeted" ? targetAgentIds : undefined,
        role,
      });
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to add agent to channel");
    } finally {
      setSubmitting(false);
    }
  };

  const toggleTarget = (id: string) => {
    setTargetAgentIds((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );
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
                <select
                  value={selectedAgentId}
                  onChange={(e) => setSelectedAgentId(e.target.value)}
                  className="w-full bg-background border border-input rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/50"
                >
                  {candidates.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.role})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1.5">Channel Role</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as ChannelRole)}
                  className="w-full bg-background border border-input rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/50 capitalize"
                >
                  <option value="lead">Lead</option>
                  <option value="senior">Senior</option>
                  <option value="member">Member</option>
                  <option value="observer">Observer</option>
                </select>
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
                <p className="text-[11px] text-muted-foreground/70 mt-1.5 leading-normal">
                  {replyMode === "user-only" && "Agent responds only to human messages. Does not trigger other agents."}
                  {replyMode === "broadcast" && "Agent responds to human and other agent messages. Triggers all channel members."}
                  {replyMode === "targeted" && "Agent responds to human and selected target agents. Triggers specified targets."}
                  {replyMode === "mention-only" && "Agent is silent unless explicitly @mentioned by name or id in a message."}
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
                  {submitting ? "Adding..." : "Add to Channel"}
                </button>
              </div>
            </>
          )}
        </form>
      </motion.div>
    </div>
  );
}
