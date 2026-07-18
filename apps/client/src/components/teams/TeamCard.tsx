import { motion } from "framer-motion";
import type { TeamDefinition } from "shared";

interface Props {
  team: TeamDefinition;
  agentNames: Record<string, string>;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}

export function TeamCard({ team, agentNames, onOpen, onDelete }: Props) {
  const leader = team.members.find((m) => m.role === "leader");
  const leaderName = leader ? agentNames[leader.agentId] || leader.agentId : null;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.2 }}
      className="bg-card border border-input rounded-xl p-4 flex flex-col justify-between h-44 hover:border-primary/20 transition-colors cursor-pointer group"
      onClick={() => onOpen(team.id)}
    >
      <div>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center flex-shrink-0 text-accent font-mono font-bold text-xs uppercase">
              {team.topology === "leader_specialists" ? "LS" : "RT"}
            </div>
            <div className="min-w-0">
              <h3 className="font-medium text-foreground text-sm truncate group-hover:text-accent transition-colors">
                {team.name}
              </h3>
              {team.description && (
                <p className="text-muted-foreground text-xs truncate mt-0.5">{team.description}</p>
              )}
            </div>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(team.id);
            }}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-error hover:bg-error/10 transition-colors flex-shrink-0 cursor-pointer"
            title="Delete Team"
          >
            <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        <div className="mt-4 space-y-1">
          <div className="text-[10px] text-text-secondary uppercase tracking-wider font-semibold">
            Topology: {team.topology === "leader_specialists" ? "Leader & Specialists" : "Roundtable"}
          </div>
          {team.topology === "leader_specialists" && leaderName && (
            <div className="text-xs text-text-secondary">
              Leader: <span className="font-medium text-text-primary">@{leaderName}</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between text-[11px] text-text-secondary border-t border-white/[0.04] pt-2.5 mt-2">
        <span>{team.members.length} Agents</span>
        <span>{new Date(team.createdAt).toLocaleDateString()}</span>
      </div>
    </motion.div>
  );
}
