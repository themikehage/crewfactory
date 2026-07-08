import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { ChannelMember, AgentInfo, ReplyMode, ChannelRole } from "shared";
import { useLiterals } from "@/lib";
import { literals as u } from "./AgentDetailPanel.literals";
import { AgentAvatar } from "@/components/shared/AgentAvatar";

interface LedgerTask {
  id: string;
  assignedBy: string;
  assignedByName: string;
  assignedTo: string;
  assignedToName: string;
  role: string;
  task: string;
  status: "open" | "in-progress" | "done" | "failed";
  createdAt: string;
  updatedAt: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  member: ChannelMember;
  agentInfo?: AgentInfo;
  allMembers: ChannelMember[];
  registeredAgents: AgentInfo[];
  channelId: string;
  streamingState?: {
    text: string;
    thinking?: string;
    toolCalls?: Record<string, { toolName: string; args: any; result: any | null; isError: boolean }>;
  };
  onUpdateMember: (agentId: string, updates: { role?: ChannelRole; replyMode?: ReplyMode; targetAgentIds?: string[] }) => Promise<void>;
  onRemoveMember: (agentId: string) => Promise<void>;
  mode: "slide-over" | "bottom-sheet";
}

export function AgentDetailPanel({
  isOpen,
  onClose,
  member,
  agentInfo,
  allMembers,
  registeredAgents,
  channelId,
  streamingState,
  onUpdateMember,
  onRemoveMember,
  mode,
}: Props) {
  const l = useLiterals(u);
  const [role, setRole] = useState<ChannelRole>(member.role || "member");
  const [replyMode, setReplyMode] = useState<ReplyMode>(member.replyMode);
  const [targetAgentIds, setTargetAgentIds] = useState<string[]>(member.targetAgentIds || []);
  const [tasks, setTasks] = useState<LedgerTask[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setRole(member.role || "member");
    setReplyMode(member.replyMode);
    setTargetAgentIds(member.targetAgentIds || []);
  }, [member]);

  useEffect(() => {
    if (!isOpen) return;
    const fetchTasks = async () => {
      setLoadingTasks(true);
      try {
        const token = localStorage.getItem("token");
        const res = await fetch(`/api/channels/${channelId}/ledger`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          const ledgerTasks: LedgerTask[] = data.tasks || [];
          setTasks(ledgerTasks.filter((t) => t.assignedTo === member.agentId));
        }
      } catch (e) {
        console.error("Failed to fetch agent tasks:", e);
      } finally {
        setLoadingTasks(false);
      }
    };
    fetchTasks();
  }, [isOpen, channelId, member.agentId]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onUpdateMember(member.agentId, { role, replyMode, targetAgentIds });
    } catch (e) {
      console.error("Failed to update member:", e);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemove = async () => {
    if (confirm(l.removeConfirm)) {
      try {
        await onRemoveMember(member.agentId);
        onClose();
      } catch (e) {
        console.error("Failed to remove member:", e);
      }
    }
  };

  const name = agentInfo?.name || member.agentId;
  const agentRole = agentInfo?.role || "agent";
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

  const overlayVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 0.4 },
    exit: { opacity: 0 },
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Overlay */}
          <motion.div
            initial="hidden"
            animate="visible"
            exit="exit"
            variants={overlayVariants}
            onClick={onClose}
            className="fixed inset-0 bg-black z-40"
          />

          {/* Panel */}
          <motion.div
            initial="hidden"
            animate="visible"
            exit="exit"
            variants={panelVariants[mode]}
            transition={{ type: "spring", damping: 25, stiffness: 220 }}
            className={`fixed bg-card border-border z-50 flex flex-col shadow-2xl ${
              mode === "slide-over"
                ? "right-0 top-0 bottom-0 w-[380px] border-l"
                : "bottom-0 left-0 right-0 h-[75vh] rounded-t-2xl border-t"
            }`}
          >
            {/* Header / Handle */}
            <div className="flex-shrink-0 p-4 border-b border-border flex items-center justify-between">
              {mode === "bottom-sheet" && (
                <div className="absolute top-2 left-1/2 -translate-x-1/2 w-12 h-1 bg-border rounded-full" />
              )}
              <h3 className="text-sm font-bold text-foreground font-display">{l.agentDetails}</h3>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-card-hover transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>

            {/* Content Scroll Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-5">
              {/* Profile Card */}
              <div className="flex items-center gap-3 bg-background/50 border border-border p-3.5 rounded-xl">
                <AgentAvatar name={name} avatarUrl={agentInfo?.avatarUrl} size="lg" />
                <div className="min-w-0 flex-1">
                  <h4 className="font-bold text-foreground text-sm truncate font-display">{name}</h4>
                  <p className="text-xs text-muted-foreground font-mono truncate">{agentRole}</p>
                  {streamingState && (
                    <span className="inline-flex items-center gap-1.5 mt-1 px-2 py-0.5 rounded-full bg-accent/15 border border-accent/20 text-[10px] text-accent font-semibold animate-pulse">
                      <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                      {l.working}
                    </span>
                  )}
                </div>
              </div>

              {/* Streaming state detail */}
              {streamingState && (
                <div className="p-3 bg-accent/5 border border-accent/10 rounded-xl space-y-2 text-xs">
                  <div className="flex items-center justify-between font-semibold text-accent">
                    <span>{l.working}</span>
                  </div>
                  {streamingState.thinking && (
                    <div className="text-[10px] bg-background/40 p-2 rounded border border-border/40 font-mono text-muted-foreground max-h-24 overflow-y-auto whitespace-pre-wrap">
                      <span className="text-accent/80 font-bold block mb-0.5">{l.thinking}</span>
                      {streamingState.thinking}
                    </div>
                  )}
                  {streamingState.text && (
                    <div className="text-[11px] bg-background/60 p-2 rounded border border-border/80 font-mono text-foreground max-h-32 overflow-y-auto whitespace-pre-wrap">
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
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as ChannelRole)}
                    className="bg-card border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-accent/50 capitalize cursor-pointer font-medium"
                  >
                    <option value="lead">Lead</option>
                    <option value="senior">Senior</option>
                    <option value="member">Member</option>
                    <option value="observer">Observer</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-muted-foreground">{l.replyMode}</label>
                  <select
                    value={replyMode}
                    onChange={(e) => setReplyMode(e.target.value as ReplyMode)}
                    className="bg-card border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-accent/50 capitalize cursor-pointer font-medium"
                  >
                    <option value="user-only">User-only</option>
                    <option value="broadcast">Broadcast</option>
                    <option value="targeted">Targeted</option>
                    <option value="mention-only">Mention-only</option>
                  </select>
                </div>

                {replyMode === "targeted" && (
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-muted-foreground">{l.targetAgents}</label>
                    <div className="border border-border rounded-lg p-2 max-h-32 overflow-y-auto space-y-1.5 bg-background/25">
                      {allMembers
                        .filter((m) => m.agentId !== member.agentId)
                        .map((m) => {
                          const agentName = registeredAgents.find((a) => a.id === m.agentId)?.name || m.agentId;
                          const isChecked = targetAgentIds.includes(m.agentId);
                          return (
                            <label key={m.agentId} className="flex items-center gap-2 text-xs text-foreground cursor-pointer font-medium">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setTargetAgentIds([...targetAgentIds, m.agentId]);
                                  } else {
                                    setTargetAgentIds(targetAgentIds.filter((id) => id !== m.agentId));
                                  }
                                }}
                                className="rounded border-border text-accent focus:ring-accent bg-card"
                              />
                              <span>{agentName}</span>
                            </label>
                          );
                        })}
                    </div>
                  </div>
                )}

                <div className="flex gap-2 pt-1.5">
                  <button
                    onClick={handleSave}
                    disabled={isSaving}
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

              {/* Delegated Tasks */}
              <div className="space-y-2 border-t border-border pt-4">
                <h5 className="text-xs font-semibold text-muted-foreground">{l.activeTasks}</h5>
                {loadingTasks ? (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <div className="w-3 h-3 border border-muted-foreground border-t-transparent rounded-full animate-spin" />
                    <span>Loading...</span>
                  </div>
                ) : tasks.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground italic">{l.noTasks}</p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {tasks.map((t) => (
                      <div key={t.id} className="p-2 border border-border rounded-lg bg-background/50 text-[11px] space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-foreground">@{t.assignedByName}</span>
                          <span className={`px-1 py-0.2 rounded text-[9px] font-bold uppercase tracking-wider ${
                            t.status === "done" ? "bg-accent/10 border border-accent/20 text-accent" : "bg-warning/10 border border-warning/20 text-warning"
                          }`}>
                            {t.status}
                          </span>
                        </div>
                        <p className="font-mono text-[10px] text-muted-foreground line-clamp-2">{t.task}</p>
                      </div>
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
        </>
      )}
    </AnimatePresence>
  );
}
