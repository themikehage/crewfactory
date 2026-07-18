import type { TeamDefinition } from "shared";

const MEMBER_COLORS = [
  "bg-accent/20 text-accent",
  "bg-blue-400/20 text-blue-400",
  "bg-pink-400/20 text-pink-400",
  "bg-amber-400/20 text-amber-400",
  "bg-purple-400/20 text-purple-400",
  "bg-orange-400/20 text-orange-400",
];


interface Props {
  team: TeamDefinition;
  agents: Record<string, { name: string; avatarUrl?: string }>;
  activeAgentIds?: Set<string>;
}

export function TeamMembersBar({ team, agents, activeAgentIds = new Set() }: Props) {
  const ordered = [...team.members].sort((a, b) => a.order - b.order);

  return (
    <div className="flex items-center gap-1.5 px-4">
      {ordered.map((member, i) => {
        const agent = agents[member.agentId];
        const name = agent?.name ?? member.agentId;
        const isActive = activeAgentIds.has(member.agentId);
        const colorClass = MEMBER_COLORS[i % MEMBER_COLORS.length] ?? "bg-accent/20 text-accent";
        const initials = name.slice(0, 2).toUpperCase();

        return (
          <div key={member.agentId} className="relative" title={`${name} (${member.role})`}>
            {agent?.avatarUrl ? (
              <img
                src={agent.avatarUrl}
                alt={name}
                className={`w-6 h-6 rounded-full object-cover ring-1 ${isActive ? "ring-accent" : "ring-white/10"}`}
              />
            ) : (
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold ring-1 ${colorClass} ${isActive ? "ring-accent" : "ring-white/10"}`}>
                {initials}
              </div>
            )}
            {isActive && (
              <span className="absolute -bottom-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-accent ring-1 ring-bg" />
            )}
          </div>
        );
      })}
    </div>
  );
}
