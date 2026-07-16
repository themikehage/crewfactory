import { useState } from "react";
import type { ChannelMember } from "shared";

interface Props {
  onClose: () => void;
  onSubmit: (opts: {
    taskPrompt: string;
    name?: string;
    singleAgentId?: string;
    criteria?: string[];
  }) => void;
  members: ChannelMember[];
  registeredAgents: any[];
  literals: Record<string, string>;
}

export function RunBenchmarkModal({ onClose, onSubmit, members, registeredAgents, literals }: Props) {
  const [taskPrompt, setTaskPrompt] = useState("");
  const [name, setName] = useState("");
  const [singleAgentId, setSingleAgentId] = useState(() => {
    const leadMember = members.find((m) => m.role === "lead");
    return leadMember ? leadMember.agentId : (members[0]?.agentId || "");
  });
  const [criteriaText, setCriteriaText] = useState("Quality, Completeness, Accuracy");
  const [loading, setLoading] = useState(false);

  const getAgentName = (id: string) => {
    const matched = registeredAgents.find((a) => a.id === id);
    return matched ? matched.name : id;
  };

  const handleStart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskPrompt.trim()) return;

    setLoading(true);
    try {
      const criteria = criteriaText
        .split(",")
        .map((c) => c.trim())
        .filter((c) => c.length > 0);

      onSubmit({
        taskPrompt: taskPrompt.trim(),
        name: name.trim() || undefined,
        singleAgentId: singleAgentId || undefined,
        criteria: criteria.length > 0 ? criteria : undefined,
      });
      onClose();
    } catch {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-xs select-none">
      <div className="bg-card border border-border w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        <div className="p-5 border-b border-border flex items-center justify-between">
          <h3 className="text-base font-bold text-foreground">{literals.modalTitle}</h3>
          <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground rounded transition-colors cursor-pointer">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleStart} className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-muted-foreground">{literals.promptLabel} *</label>
            <textarea
              required
              rows={4}
              value={taskPrompt}
              onChange={(e) => setTaskPrompt(e.target.value)}
              placeholder={literals.promptPlaceholder}
              className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary placeholder:text-muted-foreground/60 leading-relaxed"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-muted-foreground">{literals.tableName}</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={`Run ${new Date().toLocaleDateString()}`}
              className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary placeholder:text-muted-foreground/60"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted-foreground">{literals.baselineLabel}</label>
              <select
                value={singleAgentId}
                onChange={(e) => setSingleAgentId(e.target.value)}
                className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary"
              >
                {members.map((m) => (
                  <option key={m.agentId} value={m.agentId}>
                    {getAgentName(m.agentId)} {m.role === "lead" ? "(Lead)" : ""}
                  </option>
                ))}
              </select>
              <span className="text-[10px] text-muted-foreground leading-normal">{literals.baselineDesc}</span>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted-foreground">{literals.criteriaLabel}</label>
              <input
                type="text"
                value={criteriaText}
                onChange={(e) => setCriteriaText(e.target.value)}
                className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-500 rounded-xl text-xs leading-normal flex items-start gap-2.5">
            <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" className="flex-shrink-0 mt-0.5">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <span>{literals.warningEstimate}</span>
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-border mt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold border border-border text-foreground hover:bg-card-hover rounded-xl transition-colors cursor-pointer"
            >
              {literals.btnCancel}
            </button>
            <button
              type="submit"
              disabled={loading || !taskPrompt.trim()}
              className="px-4 py-2 text-xs font-semibold bg-primary hover:bg-primary/95 disabled:bg-primary/50 text-white rounded-xl transition-all cursor-pointer shadow-md shadow-primary/20"
            >
              {literals.btnSubmit}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
export default RunBenchmarkModal;
