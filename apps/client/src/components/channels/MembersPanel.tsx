import { useState } from "react";
import type { ChannelMember, AgentInfo, ReplyMode } from "shared";
import { useLiterals } from "@/lib";
import { literals as u } from "./MembersPanel.literals";
import { AgentAvatar } from "@/components/shared/AgentAvatar";
import { Dropdown } from "@/components/ui/Dropdown";
import { REPLY_MODE_OPTIONS } from "@/lib/dropdown-options";
import { useSessions } from "@/contexts/SessionsContext";

interface Props {
  members: ChannelMember[];
  registeredAgents: AgentInfo[];
  onAddClick: () => void;
  onUpdateMember: (agentId: string, replyMode: ReplyMode) => Promise<void>;
  onRemoveMember: (agentId: string) => Promise<void>;
}

export function MembersPanel({
  members,
  registeredAgents,
  onAddClick,
  onUpdateMember,
  onRemoveMember,
}: Props) {
const l = useLiterals(u);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const { getChannelMemberKanbanStatus } = useSessions();

  const getAgentInfo = (agentId: string) => {
    return registeredAgents.find((a) => a.id === agentId);
  };

  const handleModeChange = async (agentId: string, mode: ReplyMode) => {
    setUpdatingId(agentId);
    try {
      await onUpdateMember(agentId, mode);
    } finally {
      setUpdatingId(null);
    }
  };

  const leads = members.filter((m) => m.role === "lead");
  const seniors = members.filter((m) => m.role === "senior");
  const regulars = members.filter((m) => m.role === "member" || !m.role);
  const observers = members.filter((m) => m.role === "observer");

  const renderMember = (m: ChannelMember) => {
    const info = getAgentInfo(m.agentId);
    const name = info?.name || m.agentId;
    const role = info ? (info.role || "agent") : l.agentNotFound;
    const isOrphan = !info;
    const memberStatus = getChannelMemberKanbanStatus(m.agentId);
    const statusDot =
      memberStatus === "working"
        ? "bg-success shadow-[0_0_6px_rgba(74,222,128,0.6)]"
        : memberStatus === "idle"
          ? "bg-text-secondary/30"
          : "bg-text-secondary/10";

    let badgeStyle = "border-input bg-background text-muted-foreground";
    if (isOrphan) badgeStyle = "border-destructive/30 bg-destructive/10 text-destructive";
    else if (m.role === "lead") badgeStyle = "border-primary/30 bg-primary/10 text-primary";
    else if (m.role === "senior") badgeStyle = "border-purple-400/30 bg-purple-400/10 text-purple-400";
    else if (m.role === "observer") badgeStyle = "border-dashed border-text-secondary/20 bg-background/50 text-muted-foreground/60";

    return (
      <div
        key={m.agentId}
        className={`border rounded-xl p-3 flex flex-col gap-2 transition-all ${
          isOrphan
            ? "bg-destructive/5 border-dashed border-destructive/30 opacity-85"
            : "bg-background border-input"
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-1.5">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="relative flex-shrink-0">
                  <AgentAvatar
                    name={name}
                    avatarUrl={info?.avatarUrl}
                    size="xs"
                  />
                  <span className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border-2 border-background ${statusDot}`} />
                </span>
                <p className={`font-medium text-xs truncate ${isOrphan ? "text-destructive" : "text-foreground"}`}>
                  {isOrphan ? `⚠️ ${name}` : name}
                </p>
              </div>
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border tracking-wider uppercase flex-shrink-0 ${badgeStyle}`}>
                {isOrphan ? "missing" : (m.role || "member")}
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground font-mono truncate pl-3.5">{role}</p>
          </div>
          <button
            onClick={() => onRemoveMember(m.agentId)}
            className="text-muted-foreground hover:text-destructive p-1 rounded transition-colors flex-shrink-0"
            title={l.removeAgent}
          >
            <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        <div className="pt-1 border-t border-input/50 flex flex-col gap-1">
          <span className="text-xs text-muted-foreground font-medium">Reply Mode</span>
          <Dropdown<ReplyMode>
            value={m.replyMode}
            onChange={(val) => handleModeChange(m.agentId, val)}
            options={[...REPLY_MODE_OPTIONS]}
            disabled={updatingId === m.agentId}
            size="xs"
          />
          {m.replyMode === "targeted" && m.targetAgentIds && m.targetAgentIds.length > 0 && (
            <span className="text-xs text-muted-foreground truncate">
              Targets: {m.targetAgentIds.join(", ")}
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="w-72 border-l border-border bg-card flex flex-col h-full flex-shrink-0">
      <div className="flex items-center justify-between px-4 py-3 border-b border-input">
        <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">
          Channel Members ({members.length})
        </h3>
        <button
          onClick={onAddClick}
          className="p-1 text-primary hover:bg-primary/10 rounded-lg transition-colors text-xs font-medium flex items-center gap-1"
          title={l.addAgent}
        >
          <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
          </svg>
          <span>Add</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {members.length === 0 && (
          <div className="text-center py-8 text-muted-foreground text-xs">
            No agents in this channel. Click Add to invite agents.
          </div>
        )}

        {leads.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-bold text-primary/80 uppercase tracking-wider px-1">Leads</div>
            {leads.map(renderMember)}
          </div>
        )}

        {seniors.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-bold text-purple-400/80 uppercase tracking-wider px-1">Seniors</div>
            {seniors.map(renderMember)}
          </div>
        )}

        {regulars.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-bold text-muted-foreground/80 uppercase tracking-wider px-1">Members</div>
            {regulars.map(renderMember)}
          </div>
        )}

        {observers.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider px-1">Observers</div>
            {observers.map(renderMember)}
          </div>
        )}
      </div>
    </div>
  );
}
