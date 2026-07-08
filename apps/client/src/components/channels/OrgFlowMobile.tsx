import type { ChannelMember, AgentInfo } from "shared";
import type { StreamingAgentState } from "@/hooks/useChannel";
import { AgentAvatar } from "@/components/shared/AgentAvatar";

interface Props {
  members: ChannelMember[];
  registeredAgents: AgentInfo[];
  streamingAgents: Record<string, StreamingAgentState>;
  onEditAgent: (member: ChannelMember) => void;
}

const ROLE_LABELS: Record<string, { label: string; textStyle: string; badgeStyle: string }> = {
  lead: { label: "Leads", textStyle: "text-accent", badgeStyle: "bg-accent/10 border-accent/20 text-accent" },
  senior: { label: "Seniors", textStyle: "text-purple-400", badgeStyle: "bg-purple-500/10 border-purple-500/20 text-purple-400" },
  member: { label: "Members", textStyle: "text-muted-foreground", badgeStyle: "bg-card-hover border-border text-muted-foreground" },
  observer: { label: "Observers", textStyle: "text-muted-foreground/60", badgeStyle: "bg-background border-border/50 text-muted-foreground/60" },
};

export function OrgFlowMobile({ members, registeredAgents, streamingAgents, onEditAgent }: Props) {
  const getAgentInfo = (agentId: string) => {
    return registeredAgents.find((a) => a.id === agentId);
  };

  const leads = members.filter((m) => m.role === "lead");
  const seniors = members.filter((m) => m.role === "senior");
  const regulars = members.filter((m) => m.role === "member" || !m.role);
  const observers = members.filter((m) => m.role === "observer");

  const renderGroup = (groupMembers: ChannelMember[], roleKey: string) => {
    if (groupMembers.length === 0) return null;
    const config = ROLE_LABELS[roleKey] || ROLE_LABELS.member;

    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h4 className={`text-xs font-bold uppercase tracking-wider ${config.textStyle}`}>
            {config.label}
          </h4>
          <span className="text-[10px] text-muted-foreground bg-card-hover/80 px-1.5 py-0.5 rounded-full border border-border/60">
            {groupMembers.length}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-2.5">
          {groupMembers.map((m) => {
            const info = getAgentInfo(m.agentId);
            const name = info?.name || m.agentId;
            const role = info?.role || "agent";
            const isStreaming = !!streamingAgents[m.agentId];
            const streaming = streamingAgents[m.agentId];

            return (
              <div
                key={m.agentId}
                onClick={() => onEditAgent(m)}
                className={`bg-card border rounded-xl p-3.5 flex items-center justify-between gap-3 active:scale-[0.99] transition-transform ${
                  isStreaming ? "border-accent/40 shadow-sm shadow-accent/5" : "border-border"
                }`}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <AgentAvatar name={name} avatarUrl={info?.avatarUrl} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-foreground text-xs truncate">{name}</p>
                      <span className={`px-1.5 py-0.2 rounded text-[8px] font-bold border uppercase ${config.badgeStyle}`}>
                        {m.role || "member"}
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground font-mono truncate">{role}</p>

                    {isStreaming && streaming?.text && (
                      <p className="text-[9px] font-mono text-accent truncate mt-1 bg-accent/5 border border-accent/10 px-1.5 py-0.5 rounded max-w-full">
                        {streaming.text}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex-shrink-0 flex items-center gap-2">
                  {isStreaming && (
                    <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                  )}
                  <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor" className="text-muted-foreground">
                    <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-5">
      {renderGroup(leads, "lead")}
      {renderGroup(seniors, "senior")}
      {renderGroup(regulars, "member")}
      {renderGroup(observers, "observer")}
    </div>
  );
}
