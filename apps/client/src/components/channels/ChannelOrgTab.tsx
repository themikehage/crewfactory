import { useState } from "react";
import type { ChannelMember, AgentInfo, ReplyMode, ChannelRole } from "shared";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useLiterals } from "@/lib";
import { literals as u } from "./ChannelOrgTab.literals";
import { OrgFlowCanvas } from "./OrgFlowCanvas";
import { OrgFlowMobile } from "./OrgFlowMobile";
import { AgentDetailPanel } from "./AgentDetailPanel";
import type { StreamingAgentState } from "@/hooks/useChannel";

interface Props {
  members: ChannelMember[];
  registeredAgents: AgentInfo[];
  streamingAgents: Record<string, StreamingAgentState>;
  onAddMemberClick: () => void;
  onUpdateMember: (agentId: string, updates: { role?: ChannelRole; replyMode?: ReplyMode; targetAgentIds?: string[] }) => Promise<void>;
  onRemoveMember: (agentId: string) => Promise<void>;
}

export function ChannelOrgTab({
  members,
  registeredAgents,
  streamingAgents,
  onAddMemberClick,
  onUpdateMember,
  onRemoveMember,
}: Props) {
  const l = useLiterals(u);
  const { isMobile } = useIsMobile();
  const [selectedMember, setSelectedMember] = useState<ChannelMember | null>(null);

  const selectedAgentInfo = selectedMember
    ? registeredAgents.find((a) => a.id === selectedMember.agentId)
    : undefined;

  const selectedStreamingState = selectedMember
    ? streamingAgents[selectedMember.agentId]
    : undefined;

  if (members.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-muted-foreground text-xs gap-3">
        <svg width="32" height="32" viewBox="0 0 20 20" fill="currentColor" className="opacity-40">
          <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
        </svg>
        <p>{l.noAgents}</p>
        <button
          onClick={onAddMemberClick}
          className="px-3.5 py-1.5 bg-primary/10 border border-primary/20 text-primary hover:bg-primary/15 transition-colors font-semibold text-xs rounded-lg flex items-center gap-1"
        >
          <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
          </svg>
          <span>{l.addAgent}</span>
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-background overflow-hidden relative">
      {/* Sub-toolbar */}
      <div className="h-10 px-4 border-b border-border/40 flex items-center justify-between flex-shrink-0 bg-card/10 text-xs">
        <span className="font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">
          Hierarchy & Roles
        </span>
        <button
          onClick={onAddMemberClick}
          className="px-2.5 py-1 bg-accent/90 hover:bg-accent text-background font-bold text-xs rounded-lg transition-colors flex items-center gap-1 shadow-sm"
        >
          <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
          </svg>
          <span>{l.addAgent}</span>
        </button>
      </div>

      {/* Main Area (responsive dispatch) */}
      <div className="flex-1 flex min-h-0 relative">
        {isMobile ? (
          <OrgFlowMobile
            members={members}
            registeredAgents={registeredAgents}
            streamingAgents={streamingAgents}
            onEditAgent={setSelectedMember}
          />
        ) : (
          <OrgFlowCanvas
            members={members}
            registeredAgents={registeredAgents}
            streamingAgents={streamingAgents}
            onEditAgent={setSelectedMember}
          />
        )}
      </div>

      {/* Detail Slide-over / Sheet */}
      {selectedMember && (
        <AgentDetailPanel
          isOpen={true}
          onClose={() => setSelectedMember(null)}
          member={selectedMember}
          agentInfo={selectedAgentInfo}
          allMembers={members}
          registeredAgents={registeredAgents}
          streamingState={selectedStreamingState}
          onUpdateMember={onUpdateMember}
          onRemoveMember={onRemoveMember}
          mode={isMobile ? "bottom-sheet" : "slide-over"}
        />
      )}
    </div>
  );
}
