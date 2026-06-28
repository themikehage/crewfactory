import { useState } from "react";
import { motion } from "framer-motion";
import type { AgentInfo, AddMember, ReplyMode } from "shared";

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
        className="relative w-full max-w-md bg-surface border border-surface-hover rounded-2xl shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-hover">
          <div>
            <h2 className="text-sm font-semibold text-text-primary">Add Agent to Channel</h2>
            <p className="text-xs text-text-secondary mt-0.5">Configure agent behavior in this channel</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors">
            <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          {candidates.length === 0 ? (
            <p className="text-sm text-text-secondary text-center py-4">
              All registered agents are already in this channel.
            </p>
          ) : (
            <>
              <div>
                <label className="text-xs font-medium text-text-secondary block mb-1.5">Select Agent</label>
                <select
                  value={selectedAgentId}
                  onChange={(e) => setSelectedAgentId(e.target.value)}
                  className="w-full bg-bg border border-surface-hover rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent/50"
                >
                  {candidates.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.role})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-text-secondary block mb-1.5">Reply Mode</label>
                <div className="grid grid-cols-3 gap-2">
                  {(["user-only", "broadcast", "targeted"] as ReplyMode[]).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setReplyMode(mode)}
                      className={`py-2 px-2 rounded-lg border text-xs font-medium capitalize transition-colors ${
                        replyMode === mode
                          ? "bg-accent/15 border-accent/40 text-accent"
                          : "bg-bg border-surface-hover text-text-secondary hover:text-text-primary"
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-text-secondary/70 mt-1.5 leading-normal">
                  {replyMode === "user-only" && "Agent responds only to human messages. Does not trigger other agents."}
                  {replyMode === "broadcast" && "Agent responds to human and other agent messages. Triggers all channel members."}
                  {replyMode === "targeted" && "Agent responds to human and selected target agents. Triggers specified targets."}
                </p>
              </div>

              {replyMode === "targeted" && (
                <div>
                  <label className="text-xs font-medium text-text-secondary block mb-1.5">Target Agents to Trigger</label>
                  <div className="space-y-1.5 max-h-36 overflow-y-auto bg-bg p-2 rounded-lg border border-surface-hover">
                    {availableAgents.map((a) => (
                      <label key={a.id} className="flex items-center gap-2 text-xs text-text-primary cursor-pointer hover:bg-surface/50 p-1 rounded">
                        <input
                          type="checkbox"
                          checked={targetAgentIds.includes(a.id)}
                          onChange={() => toggleTarget(a.id)}
                          className="rounded border-surface-hover text-accent focus:ring-accent/50"
                        />
                        <span>{a.name} ({a.role})</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {error && (
                <div className="bg-error/10 border border-error/30 text-error text-xs px-3 py-2 rounded-lg">
                  {error}
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-2 text-sm font-medium text-text-secondary border border-surface-hover rounded-lg hover:bg-surface-hover transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !selectedAgentId}
                  className="flex-1 py-2 text-sm font-medium bg-accent text-bg rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-50"
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
