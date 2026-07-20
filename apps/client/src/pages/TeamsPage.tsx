import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTeams } from "@/hooks/useTeams";
import { TeamCard } from "@/components/teams/TeamCard";
import { TeamCreateModal } from "@/components/teams/TeamCreateModal";
import { useLiterals } from "@/lib";
import { literals as u } from "./TeamsPage.literals";
import { Button } from "@/components/ui/Button";
import { useNavigate } from "react-router-dom";
import { useAgents } from "@/hooks/useAgents";
import { buildContextPath } from "@/router/paths";

export function TeamsPage() {
  const l = useLiterals(u);
  const navigate = useNavigate();
  const { teams, loading, error, fetchTeams, createTeam, uploadTeamAvatar } = useTeams();
  const { agents: registeredAgents } = useAgents();

  const [showCreateModal, setShowCreateModal] = useState(false);

  const handleOpenTeam = useCallback(
    (id: string) => {
      navigate(buildContextPath({ type: "team", id }));
    },
    [navigate]
  );

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-hidden relative font-sans">
      <div className="h-14 px-6 border-b border-border flex items-center justify-between flex-shrink-0 bg-card/10">
        <div>
          <h1 className="text-sm font-semibold text-foreground tracking-wide Outfit">{l.pageTitle}</h1>
          <p className="text-[11px] text-muted-foreground hidden sm:block">{l.pageSubtitle}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchTeams} size="sm" className="cursor-pointer">
            {l.refresh}
          </Button>
          <Button onClick={() => setShowCreateModal(true)} size="sm" className="cursor-pointer">
            {l.createTeam}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="h-full flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="h-full flex items-center justify-center text-destructive text-xs font-semibold">
            {error}
          </div>
        ) : teams.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground text-sm gap-3 pt-20">
            <div className="w-12 h-12 rounded-2xl bg-card border border-input flex items-center justify-center">
              <span className="text-primary font-bold text-lg">#</span>
            </div>
            <div className="text-center">
              <p className="font-medium text-foreground text-sm">{l.emptyTitle}</p>
              <p className="text-xs text-muted-foreground mt-1">{l.emptyDescription}</p>
            </div>
            <Button onClick={() => setShowCreateModal(true)} size="sm" className="mt-2 cursor-pointer">
              {l.emptyButton}
            </Button>
          </div>
        ) : (
          <motion.div
            layout
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
          >
            <AnimatePresence mode="popLayout">
              {teams.map((t) => (
                <TeamCard
                  key={t.id}
                  team={t}
                  registeredAgents={registeredAgents}
                  onOpen={handleOpenTeam}
                />
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </div>

      <AnimatePresence>
        {showCreateModal && (
          <TeamCreateModal
            onClose={() => setShowCreateModal(false)}
            onCreate={createTeam}
            onUploadAvatar={uploadTeamAvatar}
            registeredAgents={registeredAgents}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
