import { apiFetch } from "@/lib/api";
import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/Button";
import { EntityAvatar } from "@/components/shared/EntityAvatar";
import { ProjectCreateModal } from "@/components/projects/ProjectCreateModal";
import { useLiterals } from "@/lib";
import { literals as l } from "./DashboardPage.literals";

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

interface Props {
  onNavigate?: (path: string) => void;
  onSelectProject: (projectId: string | null, projectName: string | null) => void;
}

export function ProjectsPage({ onNavigate: _onNavigate, onSelectProject }: Props) {
  const literals = useLiterals(l);

  const [repos, setRepos] = useState<RepoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  const fetchRepos = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiFetch("/api/workspace-projects");
      if (res.ok) {
        const data = await res.json();
        setRepos(data.projects || data.repos || []);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load projects");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRepos();
  }, [fetchRepos]);

  useEffect(() => {
    const handleUpdate = () => fetchRepos();
    window.addEventListener("entity-updated", handleUpdate);
    return () => window.removeEventListener("entity-updated", handleUpdate);
  }, [fetchRepos]);

  const handleCreateRepo = async (data: { name: string; cloneUrl?: string; avatarUrl?: string }) => {
    const res = await apiFetch("/api/workspace-projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.error || literals.createError);
    }
    const createdProject = await res.json();
    await fetchRepos();
    window.dispatchEvent(new CustomEvent("entity-updated", { detail: { type: "project" } }));
    
    return createdProject;
  };

  const handleUploadAvatar = async (id: string, file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await apiFetch(`/api/workspace-projects/${id}/avatar`, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || "Failed to upload avatar");
    }
    const data = await res.json();
    await fetchRepos();
    window.dispatchEvent(new CustomEvent("entity-updated", { detail: { type: "project" } }));
    return data.avatarUrl;
  };

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

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-hidden relative font-sans">
      <div className="h-14 px-6 border-b border-border flex items-center justify-between flex-shrink-0 bg-card/10">
        <div>
          <h1 className="text-sm font-semibold text-foreground tracking-wide Outfit">{literals.title}</h1>
          <p className="text-[11px] text-muted-foreground hidden sm:block">{literals.subtitle}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchRepos} size="sm" className="cursor-pointer">
            Refresh
          </Button>
          <Button onClick={() => setShowModal(true)} size="sm" className="cursor-pointer">
            {literals.newProject}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="h-full flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="h-full flex items-center justify-center text-destructive text-xs font-semibold">{error}</div>
        ) : repos.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground text-sm gap-3 pt-20">
            <div className="w-12 h-12 rounded-2xl bg-card border border-input flex items-center justify-center">
              <span className="text-primary font-bold text-lg">P</span>
            </div>
            <div className="text-center">
              <p className="font-medium text-foreground text-sm">{literals.emptyTitle}</p>
              <p className="text-xs text-muted-foreground mt-1">{literals.emptyDescription}</p>
            </div>
            <Button onClick={() => setShowModal(true)} size="sm" className="mt-2 cursor-pointer">
              {literals.emptyButton}
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {repos.map((repo) => (
              <div
                key={repo.name}
                className="bg-surface/40 hover:bg-surface/90 border border-input/15 hover:border-accent/30 rounded-2xl p-3 flex flex-col justify-between transition-all"
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
                  </div>
                  <h3 className="font-extrabold text-xs text-foreground truncate mt-2.5 leading-tight">{repo.name}</h3>
                  <p className="text-[9px] text-text-secondary mt-0.5 truncate font-mono">
                    {literals.id} {repo.id || repo.name}
                  </p>
                  <p className="text-[9px] text-text-secondary mt-0.5 font-medium">{formatTime(repo.lastModified)}</p>
                </div>
                <div className="flex gap-1.5 mt-3 pt-2 border-t border-input/5">
                  <button
                    onClick={() => onSelectProject(repo.id || repo.name, repo.name)}
                    className="flex-1 py-1.5 bg-bg hover:bg-accent hover:text-bg text-foreground rounded-lg text-[10px] font-bold transition-all cursor-pointer text-center"
                  >
                    {literals.open}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <ProjectCreateModal
          onClose={() => setShowModal(false)}
          onSubmit={handleCreateRepo}
          onUploadAvatar={handleUploadAvatar}
        />
      )}
    </div>
  );
}
