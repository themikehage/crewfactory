import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import type { ChannelMember, AgentInfo, ReplyMode, ChannelRole } from "shared";
import { AgentAvatar } from "@/components/shared/AgentAvatar";

export type AgentNodeData = {
  member: ChannelMember;
  agentInfo?: AgentInfo;
  streamingState?: {
    text: string;
    thinking?: string;
    toolCalls?: Record<string, { toolName: string; args: any; result: any | null; isError: boolean }>;
  };
  sessionStatus?: "idle" | "working" | "unknown";
  onEdit: () => void;
};

export type AgentNode = Node<AgentNodeData>;

const ROLE_THEME: Record<ChannelRole, {
  label: string;
  badgeStyle: string;
  cardStyle: string;
  glowStyle: string;
}> = {
  lead: {
    label: "Lead",
    badgeStyle: "bg-accent/15 border-accent/30 text-accent",
    cardStyle: "border-accent/40 bg-card shadow-lg shadow-accent/5",
    glowStyle: "shadow-[0_0_15px_rgba(74,222,128,0.15)] border-accent",
  },
  senior: {
    label: "Senior",
    badgeStyle: "bg-purple-500/15 border-purple-500/30 text-purple-400",
    cardStyle: "border-purple-500/30 bg-card shadow-md shadow-purple-500/5",
    glowStyle: "shadow-[0_0_12px_rgba(168,85,247,0.12)] border-purple-500/80",
  },
  member: {
    label: "Member",
    badgeStyle: "bg-card-hover border-border text-muted-foreground",
    cardStyle: "border-border bg-card",
    glowStyle: "shadow-[0_0_8px_rgba(255,255,255,0.05)] border-muted-foreground",
  },
  observer: {
    label: "Observer",
    badgeStyle: "bg-background border-border/50 text-muted-foreground/60",
    cardStyle: "border-dashed border-border/60 bg-card/50 opacity-75 hover:opacity-100",
    glowStyle: "border-muted-foreground/50",
  },
};

const REPLY_MODE_ICONS: Record<ReplyMode, string> = {
  broadcast: "📢",
  targeted: "🎯",
  "user-only": "👤",
  "mention-only": "🏷️",
};

export function AgentFlowNode({ data }: NodeProps<AgentNode>) {
  const { member, agentInfo, streamingState, onEdit } = data;
  const role = member.role || "member";
  const theme = ROLE_THEME[role] ?? ROLE_THEME.member;
  const name = agentInfo?.name || member.agentId;
  const isOrphan = !agentInfo;
  const agentRole = agentInfo ? (agentInfo.role || "agent") : "Deleted Agent";
  const skills = agentInfo?.skills || [];

  const isStreaming = !!streamingState;
  const sessionDot =
    data.sessionStatus === "working"
      ? "bg-success shadow-[0_0_6px_rgba(74,222,128,0.6)]"
      : data.sessionStatus === "idle"
        ? "bg-text-secondary/30"
        : "bg-text-secondary/10";

  return (
    <div className="relative group/node select-none">
      {/* Ports */}
      <Handle type="target" position={Position.Top} className="!bg-border !w-2.5 !h-2.5 !border-card-hover" />
      <Handle type="source" position={Position.Bottom} className="!bg-border !w-2.5 !h-2.5 !border-card-hover" />

      {/* Main card */}
      <div
        onClick={onEdit}
        className={`w-[220px] rounded-xl border p-3 cursor-pointer transition-all duration-300 ${
          isOrphan
            ? "border-dashed border-destructive/30 bg-destructive/5 opacity-85 shadow-[0_0_10px_rgba(239,68,68,0.05)]"
            : isStreaming
            ? theme.glowStyle
            : theme.cardStyle
        } hover:scale-[1.02] hover:-translate-y-0.5`}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-1">
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <span className="relative flex-shrink-0">
              <AgentAvatar name={name} avatarUrl={agentInfo?.avatarUrl} size="xs" />
              <span className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border-2 border-background ${sessionDot}`} />
            </span>
            <span className={`font-semibold text-xs truncate ${isOrphan ? "text-destructive" : "text-foreground"}`}>
              {isOrphan ? `⚠️ ${name}` : name}
            </span>
          </div>
          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border flex-shrink-0 ${
            isOrphan
              ? "bg-destructive/15 border-destructive/30 text-destructive"
              : theme.badgeStyle
          }`}>
            {isOrphan ? "missing" : theme.label}
          </span>
        </div>

        {/* Role Subtitle */}
        <span className="text-[10px] text-muted-foreground font-mono truncate block mt-1 pl-5">
          {agentRole}
        </span>

        {/* Info or Live Preview */}
        {isStreaming ? (
          <div className="mt-2.5 pt-2 border-t border-border/60 space-y-1">
            <div className="flex items-center gap-1 text-[9px] text-accent font-bold uppercase tracking-wider animate-pulse">
              <span className="w-1.5 h-1.5 rounded-full bg-accent" />
              <span>Working</span>
            </div>
            {streamingState.text && (
              <p className="text-[9px] font-mono text-muted-foreground line-clamp-1 bg-background/50 px-1 py-0.5 rounded border border-border/40 truncate">
                {streamingState.text}
              </p>
            )}
          </div>
        ) : (
          <div className="mt-2.5 pt-2 border-t border-border/60 flex items-center justify-between text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <span>{REPLY_MODE_ICONS[member.replyMode]}</span>
              <span className="capitalize">{member.replyMode}</span>
            </span>
            {skills.length > 0 && (
              <span className="bg-background/80 border border-border px-1.5 py-0.2 rounded font-medium">
                {skills.length} skills
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
