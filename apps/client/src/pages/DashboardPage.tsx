import { useState, useEffect } from "react";

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
  const [repos, setRepos] = useState<RepoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal states
  const [showModal, setShowModal] = useState(false);
  const [repoName, setRepoName] = useState("");
  const [cloneUrl, setCloneUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

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
        throw new Error("Failed to fetch repositories");
      }
      const data = await res.json();
      setRepos(data.repos || []);
    } catch (err: any) {
      setError(err.message || "Failed to load projects");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRepos();
  }, []);

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
        throw new Error(errData.error || "Failed to create project");
      }

      await fetchRepos();
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
    <div className="h-full flex flex-col bg-bg">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto p-3 sm:p-6 space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div>
              <h1 className="text-text-primary font-semibold text-base">Proyectos</h1>
              <p className="text-text-secondary text-[11px] mt-0.5">
                Inicializa un proyecto vacío o clona uno existente de Git para trabajar con el agente.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => onSelectRepo(null, null)}
                className="text-xs bg-surface-hover/20 text-text-secondary hover:text-text-primary border border-surface-hover/30 px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer"
              >
                Workspace Global
              </button>
              <button
                onClick={() => setShowModal(true)}
                className="text-xs bg-accent/10 text-accent hover:bg-accent/20 border border-accent/25 px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer"
              >
                + Nuevo Proyecto
              </button>
            </div>
          </div>

          {error && (
            <div className="p-4 bg-error/10 border border-error/20 text-error rounded-lg text-xs">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-text-secondary mt-4">Cargando repositorios...</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              {repos.map((repo) => (
                <div
                  key={repo.name}
                  className="bg-surface rounded-lg p-4 border border-surface-hover/30 hover:border-accent/40 transition-all flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-7 h-7 rounded-lg bg-surface-hover flex items-center justify-center">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-accent" strokeWidth="2">
                          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                        </svg>
                      </div>
                      <span className="font-semibold text-sm text-text-primary truncate">{repo.name}</span>
                    </div>
                    <p className="text-[11px] text-text-secondary">
                      Última modificación: {new Date(repo.lastModified).toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    onClick={() => onSelectRepo(repo.id || repo.name, repo.name)}
                    className="w-full mt-4 py-1.5 bg-surface-hover/20 hover:bg-accent hover:text-bg text-text-primary rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-1"
                  >
                    Abrir
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="5" y1="12" x2="19" y2="12" />
                      <polyline points="12 5 19 12 12 19" />
                    </svg>
                  </button>
                </div>
              ))}

              {repos.length === 0 && (
                <div className="col-span-full bg-surface rounded-lg p-8 text-center border border-surface-hover/30 border-dashed">
                  <div className="w-10 h-10 rounded-full bg-surface-hover flex items-center justify-center mx-auto mb-3">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-text-secondary" strokeWidth="2">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                    </svg>
                  </div>
                  <h3 className="font-semibold text-text-primary text-sm">No hay proyectos</h3>
                  <p className="text-xs text-text-secondary mt-1 max-w-xs mx-auto">
                    Crea o clona un repositorio para empezar a trabajar con el agente.
                  </p>
                  <button
                    onClick={() => setShowModal(true)}
                    className="mt-4 px-4 py-1.5 bg-accent/10 text-accent hover:bg-accent/20 border border-accent/25 rounded-lg text-xs font-semibold transition-all cursor-pointer"
                  >
                    Crear proyecto
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-surface border border-surface-hover rounded-xl w-full max-w-md p-6 shadow-2xl">
            <h2 className="text-xl font-bold text-text-primary mb-4">Nuevo Proyecto / Repositorio</h2>
            <form onSubmit={handleCreateRepo} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
                  Nombre del Proyecto
                </label>
                <input
                  type="text"
                  required
                  placeholder="ej. mi-app-web"
                  value={repoName}
                  onChange={(e) => setRepoName(e.target.value)}
                  className="w-full px-3 py-2 bg-bg border border-surface-hover rounded-lg text-sm text-text-primary focus:outline-none focus:border-accent"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
                  URL de Clonación Git (Opcional)
                </label>
                <input
                  type="text"
                  placeholder="ej. https://github.com/usuario/repo.git"
                  value={cloneUrl}
                  onChange={(e) => setCloneUrl(e.target.value)}
                  className="w-full px-3 py-2 bg-bg border border-surface-hover rounded-lg text-sm text-text-primary focus:outline-none focus:border-accent"
                />
              </div>

              {submitError && (
                <div className="p-3 bg-error/10 border border-error/20 text-error rounded-lg text-xs">
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
                  className="px-4 py-2 border border-surface-hover rounded-lg text-sm hover:bg-surface-hover text-text-primary transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-accent hover:opacity-90 disabled:opacity-50 text-bg rounded-lg text-sm font-semibold transition-opacity cursor-pointer font-bold"
                >
                  {submitting ? "Creando..." : "Crear Proyecto"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
