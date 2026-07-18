import { useState, useEffect, useCallback } from "react";
import { useTeams } from "@/hooks/useTeams";
import { TeamCard } from "@/components/teams/TeamCard";
import { CreateTeamModal } from "@/components/teams/CreateTeamModal";
import { useLiterals } from "@/lib";
import { literals as u } from "./TeamsPage.literals";
import { apiFetch } from "@/lib/api";
import { AnimatePresence } from "framer-motion";

interface Props {
  onNavigate: (path: string) => void;
  onSelectTeam: (team: { id: string; name: string } | null) => void;
}

export function TeamsPage({ onNavigate, onSelectTeam }: Props) {
  const l = useLiterals(u);
  const { teams, loading, createTeam, deleteTeam } = useTeams();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [agentNames, setAgentNames] = useState<Record<string, string>>({});

  useEffect(() => {
    async function loadAgents() {
      try {
        const res = await apiFetch("/api/agents");
        if (res.ok) {
          const data = await res.json();
          const map: Record<string, string> = {};
          for (const a of data.agents || []) {
            map[a.id] = a.name;
          }
          setAgentNames(map);
        }
      } catch {}
    }
    loadAgents();
  }, []);

  const handleOpenTeam = useCallback(
    (id: string) => {
      const team = teams.find((t) => t.id === id);
      if (team) {
        onSelectTeam({ id: team.id, name: team.name });
        onNavigate(`/teams/${id}`);
      }
    },
    [teams, onSelectTeam, onNavigate]
  );

  const handleDeleteTeam = useCallback(
    async (id: string) => {
      if (window.confirm(l.deleteConfirm)) {
        try {
          await deleteTeam(id);
        } catch {}
      }
    },
    [deleteTeam, l.deleteConfirm]
  );

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-secondary text-xs">
        {l.loading}
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-background p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/[0.06] pb-5">
          <div className="space-y-1">
            <h1 className="text-xl font-bold tracking-tight text-text-primary">{l.title}</h1>
            <p className="text-xs text-text-secondary max-w-xl leading-relaxed">{l.description}</p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-accent text-background font-semibold text-xs rounded-lg hover:opacity-90 transition-opacity flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            {l.createTeam}
          </button>
        </div>

        {teams.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 border border-dashed border-input rounded-xl bg-card/10">
            <span className="text-xs text-text-secondary">{l.noTeams}</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {teams.map((team) => (
              <TeamCard
                key={team.id}
                team={team}
                agentNames={agentNames}
                onOpen={handleOpenTeam}
                onDelete={handleDeleteTeam}
              />
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {showCreateModal && (
          <CreateTeamModal
            onClose={() => setShowCreateModal(false)}
            onCreate={createTeam}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
