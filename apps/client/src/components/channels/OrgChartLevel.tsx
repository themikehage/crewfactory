import type { ChannelMember, AgentInfo } from "shared";
import { OrgChartCard } from "./OrgChartCard";

const LEVEL_LABELS: Record<string, string> = {
  lead: "Leads",
  senior: "Seniors",
  member: "Members",
  observer: "Observers",
};

interface Props {
  role: string;
  members: ChannelMember[];
  registeredAgents: AgentInfo[];
  nodeWidth: number;
  nodeHeight: number;
  startIndex: number;
}

export function OrgChartLevel({ role, members, registeredAgents, nodeWidth, nodeHeight, startIndex }: Props) {
const label = LEVEL_LABELS[role] ?? role;

  return (
    <div className="w-full">
      <div className="flex items-center gap-2 mb-2 px-1">
        <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
          {label}
        </h4>
        <span className="text-[9px] text-muted-foreground/50 bg-card-hover/50 px-1.5 py-0.5 rounded-full">
          {members.length}
        </span>
      </div>

      <div
        className="flex justify-center gap-3 flex-wrap"
        style={{ minHeight: `${nodeHeight}px` }}
      >
        {members.map((m, idx) => {
          const info = registeredAgents.find((a) => a.id === m.agentId);
          const name = info?.name || m.agentId;
          const agentRole = info?.role || "agent";
          const skillCount = info?.skills?.length ?? 0;
          const skills = info?.skills ?? [];

          return (
            <div
              key={m.agentId}
              style={{ width: `${nodeWidth}px`, height: `${nodeHeight}px` }}
            >
              <OrgChartCard
                member={m}
                name={name}
                role={agentRole}
                skillCount={skillCount}
                skills={skills}
                animationDelay={startIndex * 0.05 + idx * 0.05}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
