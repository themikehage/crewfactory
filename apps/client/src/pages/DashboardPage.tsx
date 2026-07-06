import { useState, useEffect } from "react";
import { useToast } from "@/contexts/ToastContext";
import { useLiterals } from "@/lib";
import { literals as dashboardLiterals } from "./DashboardPage.literals";

interface RepoItem {
  id?: string;
  name: string;
  path: string;
  lastModified: string;
}

interface Props {
  onNavigate?: (path: string) => void;
  onSelectRepo: (repoId: string | null, repoName: string | null) => void;
}

export function DashboardPage({ onSelectRepo }: Props) {
  const l = useLiterals(dashboardLiterals);
  const { addToast } = useToast();
  const [repos, setRepos] = useState<RepoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal states
  const [showModal, setShowModal] = useState(false);
  const [repoName, setRepoName] = useState("");
  const [cloneUrl, setCloneUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Rename & Delete states
  const [renameRepo, setRenameRepo] = useState<RepoItem | null>(null);
  const [newName, setNewName] = useState("");
  const [deleteRepo, setDeleteRepo] = useState<RepoItem | null>(null);
  const [confirmDeleteName, setConfirmDeleteName] = useState("");
  const [deleting, setDeleting] = useState(false);

  const fetchRepos = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("token");
      const res = await fetch("/api/workspace-repos", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) {
        throw new Error(l.fetchError);
      }
      const data = await res.json();
      setRepos(data.repos || []);
    } catch (err: any) {
      setError(err.message || l.loadError);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRepos();
  }, []);

  const handleStartRename = (repo: RepoItem) => {
    setRenameRepo(repo);
    setNewName(repo.name);
  };

  const handleRename = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renameRepo || !newName.trim()) return;

    const id = renameRepo.id || renameRepo.name;
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`/api/workspace-repos/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: newName.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: l.renameError }));
        throw new Error(err.error || "Failed to rename project");
      }
      await fetchRepos();
      window.dispatchEvent(new CustomEvent("entity-updated", { detail: { type: "repo" } }));
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
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`/api/workspace-repos/${id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: l.deleteError }));
        throw new Error(err.error || "Failed to delete project");
      }
      await fetchRepos();
      window.dispatchEvent(new CustomEvent("entity-updated", { detail: { type: "repo" } }));
      setDeleteRepo(null);
      setConfirmDeleteName("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      addToast("error", msg);
    } finally {
      setDeleting(false);
    }
  };

  const handleCreateRepo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoName.trim()) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/workspace-repos", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: repoName.trim(),
          cloneUrl: cloneUrl.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || l.createError);
      }

      await fetchRepos();
      window.dispatchEvent(new CustomEvent("entity-updated", { detail: { type: "repo" } }));
      setShowModal(false);
      setRepoName("");
      setCloneUrl("");
    } catch (err: any) {
      setSubmitError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-background">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto p-3 sm:p-6 space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div>
              <h1 className="text-foreground font-semibold text-base">{l.title}</h1>
              <p className="text-muted-foreground text-[11px] mt-0.5">
                {l.subtitle}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => onSelectRepo(null, null)}
                className="text-xs bg-card-hover/20 text-muted-foreground hover:text-foreground border border-input/30 px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer"
              >
                {l.workspaceGlobal}
              </button>
              <button
                onClick={() => setShowModal(true)}
                className="text-xs bg-primary/10 text-primary hover:bg-primary/20 border border-primary/25 px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer"
              >
                {l.newProject}
              </button>
            </div>
          </div>

          {error && (
            <div className="p-4 bg-destructive/10 border border-error/20 text-destructive rounded-lg text-xs">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-muted-foreground mt-4">{l.loading}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              {repos.map((repo) => (
                <div
                  key={repo.name}
                  className="bg-card rounded-lg p-4 border border-input/30 hover:border-primary/40 transition-all flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-7 h-7 rounded-lg bg-card-hover flex items-center justify-center">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-primary" strokeWidth="2">
                          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                        </svg>
                      </div>
                      <span className="font-semibold text-sm text-foreground truncate">{repo.name}</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground font-mono truncate">
                      {l.id} {repo.id || repo.name}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {l.lastModified}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 mt-4">
                    <button
                      onClick={() => onSelectRepo(repo.id || repo.name, repo.name)}
                      className="flex-1 py-1.5 bg-card-hover/20 hover:bg-primary hover:text-background text-foreground border border-input/30 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-1"
                    >
                      {l.open}
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <line x1="5" y1="12" x2="19" y2="12" />
                        <polyline points="12 5 19 12 12 19" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleStartRename(repo)}
                      className="p-1.5 bg-card-hover/20 hover:bg-blue-400 hover:text-background text-muted-foreground hover:text-foreground rounded-lg transition-all cursor-pointer border border-transparent hover:border-blue-400/30"
                      title={l.renameTooltip}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => setDeleteRepo(repo)}
                      className="p-1.5 bg-card-hover/20 hover:bg-destructive hover:text-background text-muted-foreground hover:text-foreground rounded-lg transition-all cursor-pointer border border-transparent hover:border-error/30"
                      title={l.deleteTooltip}
                    >
                      <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}

              {repos.length === 0 && (
                <div className="col-span-full bg-card rounded-lg p-8 text-center border border-input/30 border-dashed">
                  <div className="w-10 h-10 rounded-full bg-card-hover flex items-center justify-center mx-auto mb-3">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-muted-foreground" strokeWidth="2">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                    </svg>
                  </div>
                  <h3 className="font-semibold text-foreground text-sm">{l.emptyTitle}</h3>
                  <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
                    {l.emptyDescription}
                  </p>
                  <button
                    onClick={() => setShowModal(true)}
                    className="mt-4 px-4 py-1.5 bg-primary/10 text-primary hover:bg-primary/20 border border-primary/25 rounded-lg text-xs font-semibold transition-all cursor-pointer"
                  >
                    {l.emptyButton}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-input rounded-xl w-full max-w-md p-6 shadow-2xl">
            <h2 className="text-base font-bold text-foreground mb-4">{l.createModalTitle}</h2>
            <form onSubmit={handleCreateRepo} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  {l.projectNameLabel}
                </label>
                <input
                  type="text"
                  required
                  placeholder={l.projectNamePlaceholder}
                  value={repoName}
                  onChange={(e) => setRepoName(e.target.value)}
                  className="w-full px-3 py-2 bg-background border border-input rounded-lg text-sm text-foreground focus:outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  {l.cloneUrlLabel}
                </label>
                <input
                  type="text"
                  placeholder={l.cloneUrlPlaceholder}
                  value={cloneUrl}
                  onChange={(e) => setCloneUrl(e.target.value)}
                  className="w-full px-3 py-2 bg-background border border-input rounded-lg text-sm text-foreground focus:outline-none focus:border-primary"
                />
              </div>

              {submitError && (
                <div className="p-3 bg-destructive/10 border border-error/20 text-destructive rounded-lg text-xs">
                  {submitError}
                </div>
              )}

              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    setRepoName("");
                    setCloneUrl("");
                    setSubmitError(null);
                  }}
                  className="px-4 py-2 border border-input rounded-lg text-sm hover:bg-card-hover text-foreground transition-colors cursor-pointer"
                >
                  {l.cancel}
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-primary hover:opacity-90 disabled:opacity-50 text-background rounded-lg text-sm font-semibold transition-opacity cursor-pointer"
                >
                  {submitting ? "{l.creating}" : "{l.createProject}"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {renameRepo && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-input rounded-xl w-full max-w-md p-6 shadow-2xl">
            <h2 className="text-base font-bold text-foreground mb-4">{l.renameModalTitle}</h2>
            <form onSubmit={handleRename} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  {l.newNameLabel}
                </label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full px-3 py-2 bg-background border border-input rounded-lg text-sm text-foreground focus:outline-none focus:border-primary"
                />
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => {
                    setRenameRepo(null);
                    setNewName("");
                  }}
                  className="px-4 py-2 border border-input rounded-lg text-sm hover:bg-card-hover text-foreground transition-colors cursor-pointer"
                >
{l.cancel}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-primary hover:opacity-90 text-background rounded-lg text-sm font-semibold transition-opacity cursor-pointer"
                >
                  {l.save}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteRepo && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-input rounded-xl w-full max-w-md p-6 shadow-2xl">
            <h2 className="text-base font-bold text-destructive mb-2">{l.deleteModalTitle}</h2>
            <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
              {l.deleteDescription}
            </p>
            <form onSubmit={handleDeleteRepo} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  {l.confirmLabel.replace("{name}", deleteRepo.name)}
                </label>
                <input
                  type="text"
                  required
                  placeholder={l.projectNamePlaceholderDelete}
                  value={confirmDeleteName}
                  onChange={(e) => setConfirmDeleteName(e.target.value)}
                  className="w-full px-3 py-2 bg-background border border-input rounded-lg text-sm text-foreground focus:outline-none focus:border-primary"
                />
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => {
                    setDeleteRepo(null);
                    setConfirmDeleteName("");
                  }}
                  className="px-4 py-2 border border-input rounded-lg text-sm hover:bg-card-hover text-foreground transition-colors cursor-pointer"
                >
{l.cancel}
                </button>
                <button
                  type="submit"
                  disabled={confirmDeleteName !== deleteRepo.name || deleting}
                  className="px-4 py-2 bg-destructive hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed text-foreground rounded-lg text-sm font-semibold transition-opacity cursor-pointer"
                >
                  {deleting ? "{l.deleting}" : "{l.deleteAnyway}"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
