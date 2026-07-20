import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { TeamMember, AgentInfo, TeamRole } from "shared";
import { useLiterals } from "@/lib";
import { literals as u } from "./AgentDetailPanel.literals";
import { AgentAvatar } from "@/components/shared/AgentAvatar";
import { Dropdown } from "@/components/ui/Dropdown";
import { ConfirmModal } from "@/components/ui/ConfirmModal";

export type UpdateMember = Partial<Omit<TeamMember, "agentId">>;

const TEAM_ROLE_OPTIONS = [
  { value: "lead", label: "Lead" },
  { value: "member", label: "Member" },
  { value: "observer", label: "Observer" },
] as const;

interface Props {
  isOpen: boolean;
  onClose: () => void;
  member: TeamMember;
  agentInfo?: AgentInfo;
  allMembers: TeamMember[];
  streamingState?: {
    text: string;
    thinking?: string;
    toolCalls?: Record<string, { toolName: string; args: any; result: any | null; isError: boolean }>;
  };
  onUpdateMember: (agentId: string, updates: UpdateMember) => Promise<void>;
  onRemoveMember: (agentId: string) => Promise<void>;
  mode: "slide-over" | "bottom-sheet";
}

export function AgentDetailPanel({
  isOpen,
  onClose,
  member,
  agentInfo,
  allMembers,
  streamingState,
  onUpdateMember,
  onRemoveMember,
  mode,
}: Props) {
  const l = useLiterals(u);
  const [role, setRole] = useState<TeamRole>(member.role || "member");
  const [outputMode, setOutputMode] = useState<"full-proposal" | "diff-suggestion" | "normal">(member.outputMode || "normal");
  const [isSaving, setIsSaving] = useState(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);

  useEffect(() => {
    setRole(member.role || "member");
    setOutputMode(member.outputMode || "normal");
  }, [member]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onUpdateMember(member.agentId, { role, outputMode });
    } catch (e) {
      console.error("Failed to update member:", e);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemove = () => {
    setShowRemoveConfirm(true);
  };

  const confirmRemove = async () => {
    setShowRemoveConfirm(false);
    try {
      await onRemoveMember(member.agentId);
      onClose();
    } catch (e) {
      console.error("Failed to remove member:", e);
    }
  };

  const name = agentInfo?.name || member.agentId;
  const isOrphan = !agentInfo;
  const agentRole = agentInfo ? (agentInfo.role || "agent") : l.deletedAgent;
  const skills = agentInfo?.skills || [];

  const panelVariants = {
    "slide-over": {
      hidden: { x: "100%" },
      visible: { x: 0 },
      exit: { x: "100%" },
    },
    "bottom-sheet": {
      hidden: { y: "100%" },
      visible: { y: 0 },
      exit: { y: "100%" },
    },
  };

  const backdropVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1 },
  };

  const isStreaming = !!streamingState;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial="hidden"
            animate="visible"
            exit="hidden"
            variants={backdropVariants}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/45 backdrop-blur-xs transition-opacity"
          />

          {/* Panel */}
          <motion.div
            initial="hidden"
            animate="visible"
            exit="hidden"
            variants={panelVariants[mode]}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className={`fixed z-50 bg-card border-border flex flex-col ${
              mode === "slide-over"
                ? "right-0 top-0 bottom-0 w-full sm:w-[360px] border-l shadow-2xl h-full"
                : "left-0 right-0 bottom-0 max-h-[85vh] rounded-t-2xl border-t shadow-2xl"
            }`}
          >
            {/* Header */}
            <div className="flex-shrink-0 flex items-center justify-between p-4 border-b border-border bg-card/60 backdrop-blur-sm">
              <div className="flex items-center gap-3 min-w-0">
                <AgentAvatar name={name} avatarUrl={agentInfo?.avatarUrl} size="sm" />
                <div className="flex flex-col min-w-0">
                  <h4 className="text-sm font-bold text-foreground truncate">{name}</h4>
                  <span className="text-[10px] text-muted-foreground font-mono truncate uppercase">
                    {agentRole}
                  </span>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-1 hover:bg-card-hover rounded-lg text-muted-foreground hover:text-foreground transition-colors cursor-pointer text-sm font-bold"
              >
                ×
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-6">
              {/* Live Status indicator */}
              {isStreaming && (
                <div className="border border-accent/20 bg-success/5 rounded-xl p-3.5 space-y-2.5">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-accent uppercase tracking-wider animate-pulse">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                    <span>Executing Task</span>
                  </div>
                  {streamingState.text && (
                    <div className="bg-background/80 p-3 rounded-lg border border-border/80 font-mono text-[11px] leading-relaxed max-h-40 overflow-y-auto whitespace-pre-wrap text-foreground">
                      {streamingState.text}
                    </div>
                  )}
                  {streamingState.toolCalls && Object.keys(streamingState.toolCalls).length > 0 && (
                    <div className="space-y-1">
                      {Object.entries(streamingState.toolCalls).map(([id, t]) => (
                        <div key={id} className="flex items-center justify-between text-[10px] bg-background/80 p-1.5 rounded border border-border/60 font-mono">
                          <span className="truncate max-w-[180px]">{t.toolName}</span>
                          <span className={t.result ? "text-accent" : "text-muted-foreground animate-pulse"}>
                            {t.result ? "Done" : "Running"}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Configuration Inputs */}
              <div className="space-y-3.5 pt-1.5">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-muted-foreground">{l.role}</label>
                  <Dropdown<TeamRole>
                    value={role}
                    onChange={setRole}
                    options={TEAM_ROLE_OPTIONS.map((o) => ({
                      ...o,
                      disabled: o.value === "lead" ? allMembers.some((m) => m.role === "lead" && m.agentId !== member.agentId) : false,
                    }))}
                    disabled={isOrphan}
                    matchWidth
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-muted-foreground">{l.outputMode}</label>
                  <Dropdown<"full-proposal" | "diff-suggestion" | "normal">
                    value={outputMode}
                    onChange={setOutputMode}
                    options={[
                      { value: "full-proposal", label: l.outputModeFull },
                      { value: "diff-suggestion", label: l.outputModeDiff },
                      { value: "normal", label: l.outputModeNormal },
                    ]}
                    disabled={isOrphan}
                    matchWidth
                  />
                </div>

                <div className="flex gap-2 pt-1.5">
                  <button
                    onClick={handleSave}
                    disabled={isSaving || isOrphan}
                    className="flex-1 bg-accent/90 hover:bg-accent text-background font-bold text-xs py-2 px-3 rounded-lg transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    {isSaving && <div className="w-3 h-3 border border-background border-t-transparent rounded-full animate-spin" />}
                    {l.save}
                  </button>
                </div>
              </div>

              {/* Skills */}
              <div className="space-y-1.5">
                <h5 className="text-xs font-semibold text-muted-foreground">{l.skills}</h5>
                {skills.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground italic">{l.noSkills}</p>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {skills.map((s) => (
                      <span key={s} className="px-2 py-0.5 rounded-md bg-card-hover border border-border text-[10px] text-foreground font-medium">
                        {s}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Footer / Danger Zone */}
            <div className="flex-shrink-0 p-4 border-t border-border bg-card/60 backdrop-blur-sm">
              <button
                onClick={handleRemove}
                className="w-full bg-error/10 hover:bg-error/15 border border-error/20 hover:border-error/35 text-error font-semibold text-xs py-2 rounded-lg transition-colors flex items-center justify-center gap-1.5"
              >
                <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                {l.removeAgent}
              </button>
            </div>
          </motion.div>

          <ConfirmModal
            open={showRemoveConfirm}
            onClose={() => setShowRemoveConfirm(false)}
            onConfirm={confirmRemove}
            title={l.removeAgent}
            message={l.removeConfirm}
            confirmLabel={l.removeAgent}
            destructive
          />
        </>
      )}
    </AnimatePresence>
  );
}
