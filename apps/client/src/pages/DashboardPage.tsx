import { apiFetch } from "@/lib/api";
import { useState, useEffect, useCallback, useMemo } from "react";
import { AnimatePresence } from "framer-motion";
import { useToast } from "@/contexts/ToastContext";
import { useLiterals } from "@/lib";
import { literals as dashboardLiterals } from "./DashboardPage.literals";
import { Button } from "@/components/ui/Button";
import { EntityAvatar } from "@/components/shared/EntityAvatar";
import { useSessions, type SessionItem } from "@/contexts/SessionsContext";
import { useAuth } from "@/contexts/AuthContext";
import { ProjectSettingsModal } from "@/components/projects/ProjectSettingsModal";
import { DashboardSkeleton } from "@/components/skeletons/DashboardSkeleton";

interface RepoItem {
  id?: string;
  name: string;
  path: string;
  lastModified: string;
  cloneUrl?: string | null;
  avatarUrl?: string | null;
  createdAt?: string | null;
  diskPath?: string;
}

interface AgentItem {
  id: string;
  name: string;
  role: string;
  status: string;
  createdAt: string;
  avatarUrl?: string;
}

interface TeamItem {
  id: string;
  name: string;
  description?: string;
  teamType?: string;
  members: any[];
  avatarUrl?: string | null;
}

interface Props {
  onNavigate?: (path: string) => void;
  onSelectProject: (projectId: string | null, projectName: string | null) => void;
}

export function DashboardPage({ onNavigate, onSelectProject }: Props) {
  const l = useLiterals(dashboardLiterals);
  const { addToast } = useToast();
  const { sessions } = useSessions();
  const { user } = useAuth();

  const [repos, setRepos] = useState<RepoItem[]>([]);
  const [agents, setAgents] = useState<AgentItem[]>([]);
  const [teams, setTeams] = useState<TeamItem[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [projectName, setRepoName] = useState("");
  const [cloneUrl, setCloneUrl] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [renameRepo, setRenameRepo] = useState<RepoItem | null>(null);
  const [newName, setNewName] = useState("");
  const [deleteRepo, setDeleteRepo] = useState<RepoItem | null>(null);
  const [confirmDeleteName, setConfirmDeleteName] = useState("");
  const [deleting, setDeleting] = useState(false);

  const [infoProject, setInfoProject] = useState<RepoItem | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [reposRes, agentsRes, teamsRes] = await Promise.all([
        apiFetch("/api/workspace-projects"),
        apiFetch("/api/agents"),
        apiFetch("/api/teams"),
      ]);

      if (reposRes.ok) {
        const data = await reposRes.json();
        setRepos(data.projects || data.repos || []);
      }
      if (agentsRes.ok) {
        const data = await agentsRes.json();
        setAgents(data.agents || []);
      }
      if (teamsRes.ok) {
        const data = await teamsRes.json();
        setTeams(data.teams || data || []);
      }
    } catch (err: any) {
      setError(err.message || l.loadError);
    } finally {
      setLoading(false);
    }
  }, [l]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const handleUpdate = () => {
      fetchData();
    };
    window.addEventListener("entity-updated", handleUpdate);
    return () => window.removeEventListener("entity-updated", handleUpdate);
  }, [fetchData]);

  const handleStartRename = (repo: RepoItem) => {
    setRenameRepo(repo);
    setNewName(repo.name);
  };

  const handleRename = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renameRepo || !newName.trim()) return;

    const id = renameRepo.id || renameRepo.name;
    try {
      const res = await apiFetch(`/api/workspace-projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: l.renameError }));
        throw new Error(err.error || "Failed to rename project");
      }
      await fetchData();
      window.dispatchEvent(new CustomEvent("entity-updated", { detail: { type: "project" } }));
      setRenameRepo(null);
      setNewName("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      addToast("error", msg);
    }
  };

  const handleDeleteRepo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deleteRepo || confirmDeleteName !== deleteRepo.name) return;

    setDeleting(true);
    const id = deleteRepo.id || deleteRepo.name;
    try {
      const res = await apiFetch(`/api/workspace-projects/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: l.deleteError }));
        throw new Error(err.error || "Failed to delete project");
      }
      await fetchData();
      window.dispatchEvent(new CustomEvent("entity-updated", { detail: { type: "project" } }));
      setDeleteRepo(null);
      setConfirmDeleteName("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      addToast("error", msg);
    } finally {
      setDeleting(false);
    }
  };

  const handleStartInfo = (repo: RepoItem) => {
    setInfoProject(repo);
  };

  const handleUpdateInfo = async (updates: {
    name: string;
    cloneUrl: string | null;
    avatarUrl: string | null;
  }) => {
    if (!infoProject) return;
    const id = infoProject.id || infoProject.name;
    const res = await apiFetch(`/api/workspace-projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Failed to update project" }));
      throw new Error(err.error || "Failed to update project");
    }
    await fetchData();
    window.dispatchEvent(new CustomEvent("entity-updated", { detail: { type: "project" } }));
  };

  const handleUploadProjectAvatar = useCallback(async (id: string, file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await apiFetch(`/api/workspace-projects/${id}/avatar`, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Failed to upload avatar");
    }
    const data = await res.json();
    await fetchData();
    window.dispatchEvent(new CustomEvent("entity-updated", { detail: { type: "project" } }));
    return data.avatarUrl;
  }, []);

  const handleDeleteProjectAvatar = useCallback(async (id: string) => {
    const res = await apiFetch(`/api/workspace-projects/${id}/avatar`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Failed to delete avatar");
    }
    await fetchData();
    window.dispatchEvent(new CustomEvent("entity-updated", { detail: { type: "project" } }));
  }, []);

  const handleCreateRepo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectName.trim()) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      const res = await apiFetch("/api/workspace-projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: projectName.trim(),
          cloneUrl: cloneUrl.trim() || undefined,
          avatarUrl: avatarUrl.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || l.createError);
      }

      await fetchData();
      window.dispatchEvent(new CustomEvent("entity-updated", { detail: { type: "project" } }));
      setShowModal(false);
      setRepoName("");
      setCloneUrl("");
      setAvatarUrl("");
    } catch (err: any) {
      setSubmitError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const activeSessions = useMemo(() => {
    return sessions
      .filter((s) => s.status === "streaming" || s.status === "active" || s.status === "task-running")
      .slice(0, 6);
  }, [sessions]);

  const handleOpenSession = (session: SessionItem) => {
    if (!onNavigate) return;
    let path: string;
    if (session.teamId) {
      path = `/teams/${session.teamId}/session/${session.id}`;
    } else if (session.agentId) {
      if (session.agentId === "lab-architect") {
        path = `/laboratory/session/${session.id}`;
      } else {
        path = `/agents/${session.agentId}/session/${session.id}`;
      }
    } else if (session.projectName) {
      path = `/projects/${session.projectName}/session/${session.id}`;
    } else {
      path = `/session/${session.id}`;
    }
    onNavigate(path);
  };

  const avatarLookup = useMemo(() => {
    const map = new Map<string, string | null | undefined>();
    for (const repo of repos) {
      if (repo.name) map.set(`project:${repo.name}`, repo.avatarUrl);
      if (repo.id) map.set(`project:${repo.id}`, repo.avatarUrl);
    }
    for (const agent of agents) {
      map.set(`agent:${agent.id}`, agent.avatarUrl);
    }
    for (const team of teams) {
      map.set(`team:${team.id}`, team.avatarUrl);
    }
    return (session: SessionItem) => {
      if (session.projectName) {
        const url = map.get(`project:${session.projectName}`);
        if (url) return url;
      }
      if (session.agentId) {
        const url = map.get(`agent:${session.agentId}`);
        if (url) return url;
      }
      if (session.teamId) {
        const url = map.get(`team:${session.teamId}`);
        if (url) return url;
      }
      return null;
    };
  }, [repos, agents, teams]);

  const formatTime = (updatedAt: string) => {
    const diff = Date.now() - new Date(updatedAt).getTime();
    const sec = Math.floor(diff / 1000);
    if (sec < 30) return "Just now";
    if (sec < 60) return `${sec}s ago`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h}h ago`;
    return new Date(updatedAt).toLocaleDateString();
  };

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <div className="h-full flex flex-col bg-bg overflow-y-auto pb-10 scrollbar-thin">
      <div className="bg-linear-to-b from-primary/10 via-bg to-bg px-5 pt-6 pb-4 sm:pt-10 sm:pb-8 border-b border-input/5">
        <div className="max-w-6xl mx-auto space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full overflow-hidden bg-accent/20 border border-accent/30 flex items-center justify-center font-display font-bold text-xs text-accent">
                {user?.username ? user.username.slice(0, 2).toUpperCase() : "U"}
              </div>
              <h1 className="text-foreground font-extrabold text-xl sm:text-2xl tracking-tight font-display">
                {l.welcomeBack}
              </h1>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => onSelectProject(null, null)}
                className="text-[10px] sm:text-xs bg-surface border border-input/35 hover:border-text-secondary/40 text-text-primary px-3 py-1.5 rounded-full font-bold transition-all cursor-pointer flex items-center gap-1.5"
              >
                {l.workspaceGlobal}
              </button>
              <button
                onClick={() => setShowModal(true)}
                className="text-[10px] sm:text-xs bg-accent text-bg hover:opacity-90 px-3 py-1.5 rounded-full font-bold transition-all cursor-pointer flex items-center gap-1"
              >
                + {l.newProject.replace("+ New ", "").replace("+ Nuevo ", "")}
              </button>
            </div>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1.5 -mx-5 px-5 scrollbar-none snap-x">
            <button
              onClick={() => scrollToSection("sessions-sec")}
              className="px-4 py-1.5 bg-surface-hover/80 hover:bg-surface text-[11px] font-bold rounded-full text-text-primary shrink-0 transition-all border border-input/20 cursor-pointer snap-start"
            >
              {l.sessionsSection}
            </button>
            <button
              onClick={() => scrollToSection("projects-sec")}
              className="px-4 py-1.5 bg-surface-hover/80 hover:bg-surface text-[11px] font-bold rounded-full text-text-primary shrink-0 transition-all border border-input/20 cursor-pointer snap-start"
            >
              {l.projectsSection}
            </button>
            <button
              onClick={() => scrollToSection("teams-sec")}
              className="px-4 py-1.5 bg-surface-hover/80 hover:bg-surface text-[11px] font-bold rounded-full text-text-primary shrink-0 transition-all border border-input/20 cursor-pointer snap-start"
            >
              {l.teamsSection}
            </button>
            <button
              onClick={() => scrollToSection("agents-sec")}
              className="px-4 py-1.5 bg-surface-hover/80 hover:bg-surface text-[11px] font-bold rounded-full text-text-primary shrink-0 transition-all border border-input/20 cursor-pointer snap-start"
            >
              {l.agentsSection}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-5 py-6 w-full space-y-9">
        {error && (
          <div className="p-4 bg-error/10 border border-error/20 text-error rounded-xl text-xs font-semibold">
            {error}
          </div>
        )}

        {loading ? (
          <DashboardSkeleton />
        ) : (
          <>
            {/* Seccion 1: Agentes — scroll horizontal */}
            <div id="agents-sec" className="space-y-3">
              <div className="flex justify-between items-center">
                <h2 className="text-foreground font-extrabold text-base sm:text-lg tracking-tight font-display">
                  {l.agentsSection}
                </h2>
                {onNavigate && (
                  <button
                    onClick={() => onNavigate("/agents")}
                    className="text-[11px] text-accent hover:underline font-bold"
                  >
                    {l.viewAll || "View All"}
                  </button>
                )}
              </div>
              <div className="flex overflow-x-auto gap-4 pb-1 scrollbar-none">
                {agents.map((agent) => (
                  <div
                    key={agent.id}
                    onClick={() => onNavigate?.(`/agents/${agent.id}/chat`)}
                    className="flex flex-col items-center text-center w-[80px] shrink-0 group relative cursor-pointer"
                  >
                    <div className="relative mb-1.5">
                      <EntityAvatar
                        name={agent.name}
                        avatarUrl={agent.avatarUrl}
                        size="2xl"
                        type="agent"
                        className="group-hover:scale-105 transition-transform duration-300 border border-input/20 shadow-md"
                      />
                      <span className={`absolute bottom-0.5 right-1 w-3 h-3 rounded-full border-2 border-surface ${
                        agent.status === "streaming" || agent.status === "task-running"
                          ? "bg-warning animate-pulse"
                          : agent.status === "idle"
                            ? "bg-accent"
                            : "bg-text-secondary/30"
                      }`} />
                    </div>
                    <h3 className="font-extrabold text-[11px] text-foreground truncate w-full group-hover:text-accent transition-colors leading-tight">
                      {agent.name}
                    </h3>
                    <p className="text-[9px] text-text-secondary truncate w-full mt-0.5 font-medium leading-none">
                      {agent.role}
                    </p>
                  </div>
                ))}

                {agents.length === 0 && (
                  <div className="w-full bg-surface/30 rounded-2xl p-6 text-center border border-input/10 border-dashed">
                    <p className="text-xs text-text-secondary">No agents</p>
                  </div>
                )}
              </div>
            </div>

            {/* Seccion 2: Sesiones Recientes */}
            <div id="sessions-sec" className="space-y-3">
              <h2 className="text-foreground font-extrabold text-base sm:text-lg tracking-tight font-display">
                {l.sessionsSection}
              </h2>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                {activeSessions.map((session) => {
                  let statusColor = "bg-text-secondary/40";
                  if (session.status === "streaming") statusColor = "bg-warning animate-pulse";
                  else if (session.status === "task-running") statusColor = "bg-primary animate-pulse";
                  else if (session.status === "active") statusColor = "bg-accent";

                  return (
                    <button
                      key={session.id}
                      onClick={() => handleOpenSession(session)}
                      className="flex items-center text-left bg-surface/85 hover:bg-surface border border-input/10 rounded-xl overflow-hidden hover:border-accent/20 transition-all cursor-pointer h-[58px] group relative"
                    >
                      <div className="w-[58px] h-[58px] bg-surface-hover flex-shrink-0 flex items-center justify-center relative border-r border-input/10">
                        <EntityAvatar
                          name={session.projectName || session.name}
                          avatarUrl={avatarLookup(session)}
                          size="full"
                          type={session.teamId ? "team" : session.agentId ? "agent" : "project"}
                          className="rounded-none w-full h-full"
                        />
                        <div className="absolute top-1 left-1 w-1.5 h-1.5 rounded-full z-10 shadow-xs" />
                      </div>

                      <div className="flex-1 min-w-0 px-2.5 py-1">
                        <h3 className="font-bold text-[11px] sm:text-xs text-foreground truncate group-hover:text-accent transition-colors leading-tight">
                          {session.name}
                        </h3>
                        <p className="text-[9px] text-text-secondary truncate mt-0.5 font-semibold uppercase tracking-wider">
                          {session.projectName ? `Project: ${session.projectName}` : session.teamId ? "Team" : "Agent"}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className={`w-1.5 h-1.5 rounded-full ${statusColor}`} />
                          <span className="text-[8px] text-text-secondary font-medium">
                            {formatTime(session.updatedAt)}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}

                {activeSessions.length === 0 && (
                  <div className="col-span-full bg-surface/50 border border-input/10 rounded-xl py-6 text-center">
                    <p className="text-[11px] text-text-secondary font-medium">
                      {l.noActiveSessions}
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div id="projects-sec" className="space-y-3">
              <h2 className="text-foreground font-extrabold text-base sm:text-lg tracking-tight font-display">
                {l.projectsSection}
              </h2>
              <div className="flex overflow-x-auto snap-x snap-mandatory gap-4 pb-3 -mx-5 px-5 scrollbar-none sm:mx-0 sm:px-0 sm:grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {repos.map((repo) => (
                  <div
                    key={repo.name}
                    className="w-[145px] shrink-0 snap-start bg-surface/40 hover:bg-surface/90 border border-input/15 hover:border-accent/30 rounded-2xl p-3 flex flex-col justify-between transition-all sm:w-auto"
                  >
                    <div>
                      <div className="w-full aspect-square relative rounded-xl overflow-hidden bg-surface-hover shadow-sm group">
                        <EntityAvatar
                          name={repo.name}
                          avatarUrl={repo.avatarUrl}
                          size="full"
                          type="project"
                          className="rounded-none w-full h-full object-cover"
                        />

                        {/* Quick Settings Icon on image */}
                        <button
                          onClick={() => handleStartInfo(repo)}
                          className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-black text-text-primary rounded-full hover:scale-105 transition-all opacity-0 group-hover:opacity-100 cursor-pointer"
                        >
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="12" y1="16" x2="12" y2="12" />
                            <line x1="12" y1="8" x2="12.01" y2="8" />
                          </svg>
                        </button>
                      </div>

                      <h3 className="font-extrabold text-xs text-foreground truncate mt-2.5 leading-tight">
                        {repo.name}
                      </h3>
                      <p className="text-[9px] text-text-secondary mt-0.5 truncate font-mono">
                        {l.id} {repo.id || repo.name}
                      </p>
                      <p className="text-[9px] text-text-secondary mt-0.5 font-medium">
                        {formatTime(repo.lastModified)}
                      </p>
                    </div>

                    <div className="flex gap-1.5 mt-3 pt-2 border-t border-input/5">
                      <button
                        onClick={() => onSelectProject(repo.id || repo.name, repo.name)}
                        className="flex-1 py-1.5 bg-bg hover:bg-accent hover:text-bg text-foreground rounded-lg text-[10px] font-bold transition-all cursor-pointer text-center"
                      >
                        {l.open}
                      </button>
                      <button
                        onClick={() => handleStartRename(repo)}
                        className="p-1.5 bg-bg hover:bg-surface-hover text-text-secondary rounded-lg transition-all cursor-pointer"
                        title={l.renameTooltip}
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path d="M12 20h9" />
                          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => setDeleteRepo(repo)}
                        className="p-1.5 bg-bg hover:bg-error/10 hover:text-error text-text-secondary rounded-lg transition-all cursor-pointer"
                        title={l.deleteTooltip}
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}

                {repos.length === 0 && (
                  <div className="w-[200px] shrink-0 bg-surface/30 rounded-2xl p-6 text-center border border-input/10 border-dashed sm:w-auto sm:col-span-full">
                    <p className="text-xs text-text-secondary">{l.emptyTitle}</p>
                    <button
                      onClick={() => setShowModal(true)}
                      className="mt-3 px-3 py-1.5 bg-accent/15 hover:bg-accent/25 text-accent rounded-xl text-[10px] font-bold transition-all cursor-pointer"
                    >
                      {l.emptyButton}
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div id="teams-sec" className="space-y-3">
              <div className="flex justify-between items-center">
                <h2 className="text-foreground font-extrabold text-base sm:text-lg tracking-tight font-display">
                  {l.teamsSection}
                </h2>
                {onNavigate && (
                  <button
                    onClick={() => onNavigate("/teams")}
                    className="text-[11px] text-accent hover:underline font-bold"
                  >
                    {l.viewAll || "View All"}
                  </button>
                )}
              </div>
              <div className="flex overflow-x-auto snap-x snap-mandatory gap-4 pb-3 -mx-5 px-5 scrollbar-none sm:mx-0 sm:px-0 sm:grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {teams.map((team) => (
                  <div
                    key={team.id}
                    className="w-[145px] shrink-0 snap-start bg-surface/40 hover:bg-surface/90 border border-input/15 hover:border-accent/30 rounded-2xl p-3 flex flex-col justify-between transition-all sm:w-auto"
                  >
                    <div>
                      <div className="w-full aspect-square relative rounded-xl overflow-hidden bg-surface-hover shadow-sm group">
                        <EntityAvatar
                          name={team.name}
                          avatarUrl={team.avatarUrl}
                          size="full"
                          type="team"
                          className="rounded-none w-full h-full object-cover"
                        />
                        <div className="absolute top-2 left-2 px-1.5 py-0.5 bg-black/50 text-[8px] text-text-primary font-bold rounded-md uppercase tracking-wider">
                          {team.teamType === "Orchestration" ? "ORCH" : "NEG"}
                        </div>
                      </div>

                      <h3 className="font-extrabold text-xs text-foreground truncate mt-2.5 leading-tight">
                        {team.name}
                      </h3>
                      <p className="text-[9px] text-text-secondary mt-1 font-medium line-clamp-2 h-6 leading-tight">
                        {team.description || "No description provided."}
                      </p>
                      <div className="text-[8px] text-accent/80 font-bold uppercase tracking-wider mt-1 px-1.5 py-0.5 bg-accent/10 rounded-sm inline-block">
                        {l.membersCount.replace("{count}", String(team.members?.length || 0))}
                      </div>
                    </div>

                    {onNavigate && (
                      <button
                        onClick={() => onNavigate(`/teams/${team.id}/chat`)}
                        className="w-full mt-3 py-1.5 bg-bg hover:bg-accent hover:text-bg text-foreground rounded-lg text-[10px] font-bold transition-all cursor-pointer text-center"
                      >
                        {l.open}
                      </button>
                    )}
                  </div>
                ))}

                {teams.length === 0 && (
                  <div className="w-[200px] shrink-0 bg-surface/30 rounded-2xl p-6 text-center border border-input/10 border-dashed sm:w-auto sm:col-span-full">
                    <p className="text-xs text-text-secondary">No teams</p>
                  </div>
                )}
              </div>
            </div>

          </>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-surface border border-input rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <h2 className="text-base font-bold text-foreground mb-4">{l.createModalTitle}</h2>
            <form onSubmit={handleCreateRepo} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
                  {l.projectNameLabel}
                </label>
                <input
                  type="text"
                  required
                  placeholder={l.projectNamePlaceholder}
                  value={projectName}
                  onChange={(e) => setRepoName(e.target.value)}
                  className="w-full px-3 py-2 bg-bg border border-input rounded-xl text-sm text-foreground focus:outline-none focus:border-accent"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
                  {l.cloneUrlLabel}
                </label>
                <input
                  type="text"
                  placeholder={l.cloneUrlPlaceholder}
                  value={cloneUrl}
                  onChange={(e) => setCloneUrl(e.target.value)}
                  className="w-full px-3 py-2 bg-bg border border-input rounded-xl text-sm text-foreground focus:outline-none focus:border-accent"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
                  {l.avatarUrlLabel}
                </label>
                <input
                  type="text"
                  placeholder={l.avatarUrlPlaceholder}
                  value={avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                  className="w-full px-3 py-2 bg-bg border border-input rounded-xl text-sm text-foreground focus:outline-none focus:border-accent"
                />
              </div>

              {submitError && (
                <div className="p-3 bg-error/10 border border-error/20 text-error rounded-xl text-xs font-semibold">
                  {submitError}
                </div>
              )}

              <div className="flex justify-end gap-3 mt-6">
                <Button variant="outline" type="button" onClick={() => {
                  setShowModal(false);
                  setRepoName("");
                  setCloneUrl("");
                  setAvatarUrl("");
                  setSubmitError(null);
                }}>
                  {l.cancel}
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? l.creating : l.createProject}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {renameRepo && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-surface border border-input rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <h2 className="text-base font-bold text-foreground mb-4">{l.renameModalTitle}</h2>
            <form onSubmit={handleRename} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
                  {l.newNameLabel}
                </label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full px-3 py-2 bg-bg border border-input rounded-xl text-sm text-foreground focus:outline-none focus:border-accent"
                />
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <Button variant="outline" type="button" onClick={() => {
                  setRenameRepo(null);
                  setNewName("");
                }}>
                  {l.cancel}
                </Button>
                <Button type="submit">
                  {l.save}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteRepo && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-surface border border-input rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <h2 className="text-base font-bold text-error mb-2">{l.deleteModalTitle}</h2>
            <p className="text-xs text-text-secondary mb-4 leading-relaxed font-body">
              {l.deleteDescription}
            </p>
            <form onSubmit={handleDeleteRepo} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
                  {l.confirmLabel.replace("{name}", deleteRepo.name)}
                </label>
                <input
                  type="text"
                  required
                  placeholder={l.projectNamePlaceholderDelete}
                  value={confirmDeleteName}
                  onChange={(e) => setConfirmDeleteName(e.target.value)}
                  className="w-full px-3 py-2 bg-bg border border-input rounded-xl text-sm text-foreground focus:outline-none focus:border-error"
                />
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <Button variant="outline" type="button" onClick={() => {
                  setDeleteRepo(null);
                  setConfirmDeleteName("");
                }}>
                  {l.cancel}
                </Button>
                <Button
                  variant="destructive"
                  type="submit"
                  disabled={confirmDeleteName !== deleteRepo.name || deleting}
                >
                  {deleting ? l.deleting : l.deleteAnyway}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      <AnimatePresence>
        {infoProject && (
          <ProjectSettingsModal
            project={{
              id: infoProject.id || infoProject.name,
              name: infoProject.name,
              cloneUrl: infoProject.cloneUrl,
              avatarUrl: infoProject.avatarUrl,
              createdAt: infoProject.createdAt,
              diskPath: infoProject.diskPath,
            }}
            onClose={() => setInfoProject(null)}
            onSave={handleUpdateInfo}
            onUploadAvatar={handleUploadProjectAvatar}
            onDeleteAvatar={handleDeleteProjectAvatar}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
