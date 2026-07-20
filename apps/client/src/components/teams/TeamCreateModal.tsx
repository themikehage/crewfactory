import { useState } from "react";
import { motion } from "framer-motion";
import type { TeamMember, CreateTeam } from "shared";
import { useLiterals } from "@/lib";
import { literals as u } from "./TeamCreateModal.literals";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { AgentAvatar } from "@/components/shared/AgentAvatar";
import { AvatarUploadField } from "@/components/shared/AvatarUploadField";
import { DEFAULT_AVATAR_PREFIX } from "@/lib/defaultAvatars";

interface TeamCreateModalProps {
  onClose: () => void;
  onCreate: (data: CreateTeam) => Promise<any>;
  onUploadAvatar?: (id: string, file: File) => Promise<string>;
  registeredAgents: any[];
}

export function TeamCreateModal({
  onClose,
  onCreate,
  onUploadAvatar,
  registeredAgents,
}: TeamCreateModalProps) {
  const l = useLiterals(u);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [teamType, setTeamType] = useState<"Negotiation" | "Orchestration">("Negotiation");
  const [leaderAgentId, setLeaderAgentId] = useState("");
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Avatar state
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [selectedDefaultAvatar, setSelectedDefaultAvatar] = useState<string | null>(null);

  const leaderOptions = registeredAgents.map((a: any) => ({
    value: a.id,
    label: `${a.name} (${a.id})`,
  }));

  const nonLeaderAgents = registeredAgents.filter((a: any) => a.id !== leaderAgentId);

  const handleAvatarChange = (file: File | null, preview: string | null) => {
    setAvatarFile(file);
    setSelectedDefaultAvatar(null);
    setAvatarPreview(preview);
  };

  const handleSelectDefaultAvatar = (avatarId: string) => {
    setSelectedDefaultAvatar(avatarId);
    setAvatarFile(null);
    setAvatarPreview(DEFAULT_AVATAR_PREFIX + avatarId);
  };

  const handleClearAvatar = () => {
    setSelectedDefaultAvatar(null);
    setAvatarFile(null);
    setAvatarPreview(null);
  };

  const toggleMember = (agentId: string) => {
    setSelectedMemberIds((prev) =>
      prev.includes(agentId)
        ? prev.filter((id) => id !== agentId)
        : [...prev, agentId]
    );
  };

  const handleLeaderChange = (id: string) => {
    setLeaderAgentId(id);
    setError(null);
  };

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
      const members: TeamMember[] = [
        { agentId: leaderAgentId, role: "lead" },
        ...selectedMemberIds.map((id) => ({ agentId: id, role: "member" as const })),
      ];

      const resolvedAvatarUrl = selectedDefaultAvatar
        ? DEFAULT_AVATAR_PREFIX + selectedDefaultAvatar
        : avatarPreview && !avatarPreview.startsWith("blob:")
          ? avatarPreview
          : undefined;

      const team = await onCreate({
        name: name.trim(),
        description: description.trim() || undefined,
        avatarUrl: resolvedAvatarUrl,
        teamType,
        members,
      });

      if (avatarFile && team.id && onUploadAvatar) {
        await onUploadAvatar(team.id, avatarFile);
      }

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
        className="relative w-full max-w-md bg-card border border-input rounded-2xl shadow-2xl overflow-hidden z-10 max-h-[85vh] flex flex-col"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-input flex-shrink-0">
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

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4 overflow-y-auto flex-1">
          <AvatarUploadField
            preview={avatarPreview}
            selectedDefault={selectedDefaultAvatar}
            onFileChange={handleAvatarChange}
            onSelectDefault={handleSelectDefaultAvatar}
            onClear={handleClearAvatar}
            entityName={name}
            avatarType="entity"
            entityAvatarEntityType="team"
          />

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
              <Dropdown<string>
                value={leaderAgentId}
                onChange={handleLeaderChange}
                options={leaderOptions}
                placeholder={l.selectLeaderPlaceholder}
                matchWidth
              />
            )}
          </div>

          {leaderAgentId && nonLeaderAgents.length > 0 && (
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">{l.membersLabel}</label>
              <div className="space-y-1 max-h-[140px] overflow-y-auto border border-input rounded-lg p-1.5 bg-background/50">
                {nonLeaderAgents.map((agent: any) => {
                  const isSelected = selectedMemberIds.includes(agent.id);
                  return (
                    <label
                      key={agent.id}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-xs cursor-pointer transition-colors ${
                        isSelected
                          ? "bg-primary/10 text-foreground"
                          : "text-muted-foreground hover:bg-card-hover"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleMember(agent.id)}
                        className="rounded border-input text-primary focus:ring-primary accent-primary"
                      />
                      <AgentAvatar name={agent.name} avatarUrl={agent.avatarUrl} size="xs" />
                      <span className="font-medium">{agent.name}</span>
                      <span className="text-muted-foreground ml-auto">{agent.id}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {error && (
            <div className="bg-destructive/10 border border-error/30 text-destructive text-xs px-3 py-2 rounded-lg">
              {error}
            </div>
          )}

          <div className="flex gap-2 pt-2 border-t border-input bg-card flex-shrink-0">
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
