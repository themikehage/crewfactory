import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTeams } from "@/hooks/useTeams";
import { TeamCard } from "@/components/teams/TeamCard";
import { TeamMembersModal } from "@/components/teams/TeamMembersModal";
import type { Team, TeamMember, CreateTeam } from "shared";
import { useLiterals } from "@/lib";
import { literals as u } from "./TeamsPage.literals";
import { Button } from "@/components/ui/Button";
import { useNavigate } from "react-router-dom";
import { useAgents } from "@/hooks/useAgents";
import { buildContextPath } from "@/router/paths";

function CreateTeamModal({
  onClose,
  onCreate,
  registeredAgents
}: {
  onClose: () => void;
  onCreate: (data: CreateTeam) => Promise<any>;
  registeredAgents: any[];
}) {
  const l = useLiterals(u);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [teamType, setTeamType] = useState<"Negotiation" | "Orchestration">("Negotiation");
  const [leaderAgentId, setLeaderAgentId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (!leaderAgentId) {
      setError(l.selectLeaderPlaceholder);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await onCreate({
        name: name.trim(),
        description: description.trim() || undefined,
        teamType,
        members: [{ agentId: leaderAgentId, role: "lead" }],
      });
      onClose();
    } catch (err: any) {
      setError(err.message || l.createError);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 8 }}
        transition={{ duration: 0.18 }}
        className="relative w-full max-w-md bg-card border border-input rounded-2xl shadow-2xl overflow-hidden z-10"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-input">
          <div>
            <h2 className="text-sm font-semibold text-foreground">{l.createTitle}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{l.createSubtitle}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-card-hover transition-colors cursor-pointer">
            <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">{l.teamNameLabel}</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={l.teamNamePlaceholder}
              className="w-full bg-background border border-input rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">{l.descriptionLabel}</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={l.descriptionPlaceholder}
              className="w-full bg-background border border-input rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-2">{l.teamTypeLabel}</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setTeamType("Negotiation")}
                className={`flex flex-col items-center justify-center p-2 rounded-lg border text-xs cursor-pointer font-semibold transition-all ${
                  teamType === "Negotiation"
                    ? "border-primary bg-primary/5 text-foreground"
                    : "border-input bg-background text-muted-foreground hover:text-foreground"
                }`}
              >
                Negotiation
              </button>
              <button
                type="button"
                onClick={() => setTeamType("Orchestration")}
                className={`flex flex-col items-center justify-center p-2 rounded-lg border text-xs cursor-pointer font-semibold transition-all ${
                  teamType === "Orchestration"
                    ? "border-primary bg-primary/5 text-foreground"
                    : "border-input bg-background text-muted-foreground hover:text-foreground"
                }`}
              >
                Orchestration
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">{l.leaderLabel}</label>
            {registeredAgents.length === 0 ? (
              <p className="text-xs text-destructive">{l.noAgentsError}</p>
            ) : (
              <select
                required
                value={leaderAgentId}
                onChange={(e) => setLeaderAgentId(e.target.value)}
                className="w-full bg-background border border-input rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 cursor-pointer"
              >
                <option value="">{l.selectLeaderPlaceholder}</option>
                {registeredAgents.map((agent: any) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name} ({agent.id})
                  </option>
                ))}
              </select>
            )}
          </div>

          {error && (
            <div className="bg-destructive/10 border border-error/30 text-destructive text-xs px-3 py-2 rounded-lg animate-shake">
              {error}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <Button variant="outline" type="button" onClick={onClose} className="flex-1 cursor-pointer">
              {l.cancel}
            </Button>
            <Button type="submit" disabled={submitting || !name.trim() || !leaderAgentId} className="flex-1 cursor-pointer">
              {submitting ? l.creating : l.createTeam}
            </Button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

export function TeamsPage() {
  const l = useLiterals(u);
  const navigate = useNavigate();
  const { teams, loading, error, fetchTeams, createTeam, deleteTeam, updateTeam } = useTeams();
  const { agents: registeredAgents } = useAgents();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [managingMembersTeam, setManagingMembersTeam] = useState<Team | null>(null);

  const handleOpenTeam = useCallback(
    (id: string) => {
      navigate(buildContextPath({ type: "team", id }));
    },
    [navigate]
  );

  const handleDeleteTeam = useCallback(
    async (id: string) => {
      if (window.confirm("Are you sure you want to delete this team?")) {
        await deleteTeam(id);
      }
    },
    [deleteTeam]
  );

  const handleAddMember = async (data: TeamMember) => {
    if (!managingMembersTeam) return;
    const updatedMembers = [...(managingMembersTeam.members || [])];
    updatedMembers.push(data);
    const updated = await updateTeam(managingMembersTeam.id, { members: updatedMembers });
    if (updated) setManagingMembersTeam(updated);
  };

  const handleUpdateMember = async (agentId: string, data: Partial<TeamMember>) => {
    if (!managingMembersTeam) return;
    const updatedMembers = (managingMembersTeam.members || []).map((m) => {
      if (m.agentId === agentId) {
        return { ...m, ...data };
      }
      return m;
    });
    const updated = await updateTeam(managingMembersTeam.id, { members: updatedMembers });
    if (updated) setManagingMembersTeam(updated);
  };

  const handleRemoveMember = async (agentId: string) => {
    if (!managingMembersTeam) return;
    const updatedMembers = (managingMembersTeam.members || []).filter((m) => m.agentId !== agentId);
    const updated = await updateTeam(managingMembersTeam.id, { members: updatedMembers });
    if (updated) setManagingMembersTeam(updated);
  };

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
                  onDelete={handleDeleteTeam}
                  onManageMembers={setManagingMembersTeam}
                />
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </div>

      <AnimatePresence>
        {showCreateModal && (
          <CreateTeamModal
            onClose={() => setShowCreateModal(false)}
            onCreate={createTeam}
            registeredAgents={registeredAgents}
          />
        )}

        {managingMembersTeam && (
          <TeamMembersModal
            teamName={managingMembersTeam.name}
            members={managingMembersTeam.members || []}
            registeredAgents={registeredAgents}
            onClose={() => setManagingMembersTeam(null)}
            onAddMember={handleAddMember}
            onUpdateMember={handleUpdateMember}
            onRemoveMember={handleRemoveMember}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
