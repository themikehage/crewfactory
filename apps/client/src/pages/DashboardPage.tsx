import { apiFetch } from "@/lib/api";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/contexts/ToastContext";
import { useLiterals } from "@/lib";
import { literals as dashboardLiterals } from "./DashboardPage.literals";
import { Button } from "@/components/ui/Button";

interface RepoItem {
  id?: string;
  name: string;
  path: string;
  lastModified: string;
  cloneUrl?: string | null;
  createdAt?: string | null;
  diskPath?: string;
}

interface Props {
  onNavigate?: (path: string) => void;
  onSelectProject: (projectId: string | null, projectName: string | null) => void;
}

export function DashboardPage({ onSelectProject }: Props) {
  const l = useLiterals(dashboardLiterals);
  const { addToast } = useToast();
  const [repos, setRepos] = useState<RepoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal states
  const [showModal, setShowModal] = useState(false);
  const [projectName, setRepoName] = useState("");
  const [cloneUrl, setCloneUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Rename & Delete states
  const [renameRepo, setRenameRepo] = useState<RepoItem | null>(null);
  const [newName, setNewName] = useState("");
  const [deleteRepo, setDeleteRepo] = useState<RepoItem | null>(null);
  const [confirmDeleteName, setConfirmDeleteName] = useState("");
  const [deleting, setDeleting] = useState(false);

  // Project Info / Details states
  const [infoProject, setInfoProject] = useState<RepoItem | null>(null);
  const [infoName, setInfoName] = useState("");
  const [infoCloneUrl, setInfoCloneUrl] = useState("");
  const [infoSaving, setInfoSaving] = useState(false);
  const [infoError, setInfoError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState(false);

  const fetchRepos = async () => {
    try {
      setLoading(true);
      const res = await apiFetch("/api/workspace-projects");
      if (!res.ok) {
        throw new Error(l.fetchError);
      }
      const data = await res.json();
      setRepos(data.projects || data.repos || []);
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
    try {
      const res = await apiFetch(`/api/workspace-projects/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"},
        body: JSON.stringify({ name: newName.trim() })});
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: l.renameError }));
        throw new Error(err.error || "Failed to rename project");
      }
      await fetchRepos();
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
        method: "DELETE"});
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: l.deleteError }));
        throw new Error(err.error || "Failed to delete project");
      }
      await fetchRepos();
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
    setInfoName(repo.name);
    setInfoCloneUrl(repo.cloneUrl || "");
    setInfoSaving(false);
    setInfoError(null);
    setCopiedId(false);
  };

  const handleUpdateInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!infoProject) return;

    setInfoSaving(true);
    setInfoError(null);
    const id = infoProject.id || infoProject.name;
    try {
      const res = await apiFetch(`/api/workspace-projects/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"},
        body: JSON.stringify({
          name: infoName.trim(),
          cloneUrl: infoCloneUrl.trim() || null})});
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed to update project" }));
        throw new Error(err.error || "Failed to update project");
      }
      await fetchRepos();
      window.dispatchEvent(new CustomEvent("entity-updated", { detail: { type: "project" } }));
      setInfoProject(null);
    } catch (err: any) {
      setInfoError(err.message);
    } finally {
      setInfoSaving(false);
    }
  };

  const handleCopyId = () => {
    if (!infoProject) return;
    const id = infoProject.id || infoProject.name;
    navigator.clipboard.writeText(id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const handleCreateRepo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectName.trim()) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      const res = await apiFetch("/api/workspace-projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"},
        body: JSON.stringify({
          name: projectName.trim(),
          cloneUrl: cloneUrl.trim() || undefined})});

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || l.createError);
      }

      await fetchRepos();
      window.dispatchEvent(new CustomEvent("entity-updated", { detail: { type: "project" } }));
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
                onClick={() => onSelectProject(null, null)}
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
                      onClick={() => onSelectProject(repo.id || repo.name, repo.name)}
                      className="flex-1 py-1.5 bg-card-hover/20 hover:bg-primary hover:text-background text-foreground border border-input/30 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-1"
                    >
                      {l.open}
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <line x1="5" y1="12" x2="19" y2="12" />
                        <polyline points="12 5 19 12 12 19" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleStartInfo(repo)}
                      className="p-1.5 bg-card-hover/20 hover:bg-primary hover:text-background text-muted-foreground hover:text-foreground rounded-lg transition-all cursor-pointer border border-transparent hover:border-primary/30"
                      title={l.infoModalTitle}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="16" x2="12" y2="12" />
                        <line x1="12" y1="8" x2="12.01" y2="8" />
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
                  value={projectName}
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
                <Button variant="outline" onClick={() => {
                  setShowModal(false);
                  setRepoName("");
                  setCloneUrl("");
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
                <Button variant="outline" onClick={() => {
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
                <Button variant="outline" onClick={() => {
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
                  {deleting ? "{l.deleting}" : "{l.deleteAnyway}"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      <AnimatePresence>
        {infoProject && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              transition={{ duration: 0.18 }}
              className="bg-card border border-input rounded-xl w-full max-w-md p-6 shadow-2xl relative"
            >
              <button
                type="button"
                onClick={() => setInfoProject(null)}
                className="absolute top-4 right-4 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-card-hover transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>

              <h2 className="text-base font-bold text-foreground mb-4">{l.infoModalTitle}</h2>

              <form onSubmit={handleUpdateInfo} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                    {l.projectNameLabel}
                  </label>
                  <input
                    type="text"
                    required
                    value={infoName}
                    onChange={(e) => setInfoName(e.target.value)}
                    className="w-full px-3 py-2 bg-background border border-input rounded-lg text-sm text-foreground focus:outline-none focus:border-primary"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                    {l.cloneUrlLabelEditable}
                  </label>
                  <input
                    type="text"
                    placeholder={l.cloneUrlPlaceholder}
                    value={infoCloneUrl}
                    onChange={(e) => setInfoCloneUrl(e.target.value)}
                    className="w-full px-3 py-2 bg-background border border-input rounded-lg text-sm text-foreground focus:outline-none focus:border-primary"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                    ID
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      readOnly
                      value={infoProject.id || infoProject.name}
                      className="flex-1 px-3 py-2 bg-card-hover/20 border border-input rounded-lg text-sm text-muted-foreground font-mono focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleCopyId}
                      className="px-3 py-2 bg-card-hover/40 hover:bg-card-hover text-xs rounded-lg font-semibold transition-colors border border-input/30"
                    >
                      {copiedId ? l.copied : l.copyId}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                    {l.createdAtLabel}
                  </label>
                  <input
                    type="text"
                    readOnly
                    value={infoProject.createdAt ? new Date(infoProject.createdAt).toLocaleString() : l.noValue}
                    className="w-full px-3 py-2 bg-card-hover/20 border border-input rounded-lg text-sm text-muted-foreground focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                    {l.diskPathLabel}
                  </label>
                  <input
                    type="text"
                    readOnly
                    value={infoProject.diskPath || l.noValue}
                    className="w-full px-3 py-2 bg-card-hover/20 border border-input rounded-lg text-[11px] text-muted-foreground font-mono focus:outline-none overflow-x-auto"
                  />
                </div>

                {infoError && (
                  <div className="p-3 bg-destructive/10 border border-error/20 text-destructive rounded-lg text-xs">
                    {infoError}
                  </div>
                )}

                <div className="flex justify-end gap-3 mt-6">
                  <Button variant="outline" type="button" onClick={() => setInfoProject(null)}>
                    {l.cancel}
                  </Button>
                  <Button type="submit" disabled={infoSaving}>
                    {infoSaving ? l.saving : l.saveChanges}
                  </Button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
