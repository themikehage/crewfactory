import type { TeamDefinition } from "shared";
import type { StreamingAgentState } from "@/hooks/useTeam";

interface Props {
  team: TeamDefinition;
  streamingAgents: Record<string, StreamingAgentState>;
  activeRunId: string | null;
}

function PulsingDot({ active }: { active: boolean }) {
  return (
    <span className={`inline-block w-2 h-2 rounded-full mr-2 shrink-0 ${active ? "bg-accent animate-pulse" : "bg-white/20"}`} />
  );
}

function ToolCallItem({ toolName, isError, isPartial }: { toolName: string; isError: boolean; isPartial?: boolean }) {
  return (
    <div className={`flex items-center gap-1.5 text-[10px] mt-1 ml-4 ${isError ? "text-error" : isPartial ? "text-text-secondary" : "text-accent"}`}>
      <svg width="9" height="9" viewBox="0 0 9 9" fill="none"><circle cx="4.5" cy="4.5" r="3.5" stroke="currentColor" strokeWidth="1.2"/></svg>
      <span>{toolName}</span>
      {isPartial && <span className="opacity-50">running…</span>}
      {!isPartial && !isError && <span className="opacity-50">done</span>}
      {isError && <span className="opacity-75">error</span>}
    </div>
  );
}

export function TeamRunProgress({ team, streamingAgents, activeRunId }: Props) {
  if (!activeRunId) return null;

  const orderedMembers = [...team.members].sort((a, b) => a.order - b.order);
  const hasAnyActivity = Object.keys(streamingAgents).length > 0;

  return (
    <div className="border-t border-white/[0.06] bg-surface px-4 py-3 space-y-2">
      <div className="flex items-center gap-2 mb-1">
        <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
        <span className="text-[10px] font-medium text-text-secondary uppercase tracking-wider">Running</span>
      </div>
      {orderedMembers.map((member) => {
        const agentState = streamingAgents[member.agentId];
        const isActive = Boolean(agentState);

        return (
          <div key={member.agentId} className="flex flex-col">
            <div className="flex items-center gap-2">
              <PulsingDot active={isActive} />
              <span className={`text-xs font-medium truncate ${isActive ? "text-text-primary" : "text-text-secondary"}`}>
                {agentState?.agentName ?? member.agentId}
              </span>
              {member.role !== "peer" && (
                <span className="text-[9px] text-text-secondary/60 uppercase tracking-wider ml-auto">{member.role}</span>
              )}
            </div>
            {agentState?.text && (
              <p className="text-[10px] text-text-secondary ml-4 mt-0.5 line-clamp-2 leading-relaxed">
                {agentState.text.slice(-200)}
              </p>
            )}
            {agentState?.toolCalls && Object.entries(agentState.toolCalls).slice(-2).map(([id, tc]) => (
              <ToolCallItem key={id} toolName={tc.toolName} isError={tc.isError} isPartial={Boolean((tc as any).isPartial)} />
            ))}
            {agentState?.thinking && (
              <p className="text-[10px] text-text-secondary/50 ml-4 mt-0.5 italic line-clamp-1">
                {agentState.thinking.slice(-100)}
              </p>
            )}
          </div>
        );
      })}
      {!hasAnyActivity && (
        <p className="text-[10px] text-text-secondary">Initializing agents…</p>
      )}
    </div>
  );
}
