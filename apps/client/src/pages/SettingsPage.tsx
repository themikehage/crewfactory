import { useState, useEffect, useCallback, Fragment } from "react";
import { useAuth } from "@/contexts/AuthContext";

interface ProviderInfo {
  id: string;
  name: string;
  authStatus: { configured: boolean; source?: string };
  models: Array<{ id: string; name: string; reasoning: boolean }>;
}

export function SettingsPage() {
  const { user, logout } = useAuth();
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [envVars, setEnvVars] = useState<Array<{ key: string; value: string }>>([]);
  const [envLoading, setEnvLoading] = useState(true);
  const [envError, setEnvError] = useState("");
  const [isAddingEnv, setIsAddingEnv] = useState(false);
  const [newEnvKey, setNewEnvKey] = useState("");
  const [newEnvVal, setNewEnvVal] = useState("");
  const [savingEnv, setSavingEnv] = useState(false);

  const token = localStorage.getItem("token");

  const fetchProviders = useCallback(async () => {
    try {
      const res = await fetch("/api/providers", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load providers");
      const data = await res.json();
      const sorted = (data.providers ?? []).sort((a: ProviderInfo, b: ProviderInfo) => {
        if (a.authStatus.configured && !b.authStatus.configured) return -1;
        if (!a.authStatus.configured && b.authStatus.configured) return 1;
        return a.name.localeCompare(b.name);
      });
      setProviders(sorted);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error loading providers");
    } finally {
      setLoading(false);
    }
  }, [token]);

  const fetchEnvVars = useCallback(async () => {
    try {
      const res = await fetch("/api/env", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load environment variables");
      const data = await res.json();
      setEnvVars(data.env ?? []);
    } catch (err) {
      setEnvError(err instanceof Error ? err.message : "Error loading environment variables");
    } finally {
      setEnvLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchProviders();
    fetchEnvVars();
  }, [fetchProviders, fetchEnvVars]);

  const handleSaveEnvVar = async () => {
    const formattedKey = newEnvKey.trim().toUpperCase();
    if (!formattedKey || !newEnvVal.trim()) return;

    if (!/^[A-Z_][A-Z0-9_]*$/.test(formattedKey)) {
      setEnvError("Invalid variable name. Must start with a letter or underscore and contain only letters, numbers, or underscores.");
      return;
    }

    setSavingEnv(true);
    setEnvError("");
    try {
      const res = await fetch("/api/env", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ key: formattedKey, value: newEnvVal }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to save environment variable");
      }
      setNewEnvKey("");
      setNewEnvVal("");
      setIsAddingEnv(false);
      await fetchEnvVars();
    } catch (err) {
      setEnvError(err instanceof Error ? err.message : "Error saving environment variable");
    } finally {
      setSavingEnv(false);
    }
  };

  const handleDeleteEnvVar = async (key: string) => {
    try {
      const res = await fetch(`/api/env/${key}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to delete environment variable");
      await fetchEnvVars();
    } catch (err) {
      setEnvError(err instanceof Error ? err.message : "Error deleting environment variable");
    }
  };

  const handleSaveKey = async () => {
    if (!selectedProvider || !apiKey.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/providers/${selectedProvider}/key`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ apiKey }),
      });
      if (!res.ok) throw new Error("Failed to save API key");
      setApiKey("");
      setSelectedProvider(null);
      await fetchProviders();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error saving key");
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveKey = async (providerId: string) => {
    try {
      const res = await fetch(`/api/providers/${providerId}/key`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to remove API key");
      await fetchProviders();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error removing key");
    }
  };

  return (
    <div className="h-full flex flex-col bg-bg">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto p-3 sm:p-6 space-y-6">
          <div className="bg-surface rounded-lg p-4 flex items-center justify-between border border-surface-hover/30">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-accent/15 flex items-center justify-center text-accent font-semibold font-mono uppercase select-none">
                {user?.username?.[0] || "?"}
              </div>
              <div>
                <div className="text-text-primary text-sm font-medium">{user?.username}</div>
                <div className="text-text-secondary text-[11px]">Active Session</div>
              </div>
            </div>
            <button
              onClick={logout}
              className="text-xs bg-error/10 text-error hover:bg-error/20 border border-error/20 px-3.5 py-1.5 rounded-lg font-semibold transition-all cursor-pointer"
            >
              Sign Out
            </button>
          </div>

          <div>
            <h2 className="text-text-primary font-semibold text-base mb-4">Providers</h2>
            {error && (
              <p className="text-error text-sm mb-4 p-3 bg-surface rounded-lg">{error}</p>
            )}
            <div className="relative mb-4">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary pointer-events-none"
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
              </svg>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search providers..."
                className="w-full pl-10 pr-3 py-2 bg-surface border border-surface-hover rounded-lg
                           text-text-primary placeholder-text-secondary outline-none
                           focus:border-accent transition-colors text-sm"
              />
            </div>
            {loading ? (
              <div className="flex justify-center py-8">
                <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <div className="space-y-3">
                {providers
                  .filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
                  .map((p, index, arr) => {
                  const showDivider = index > 0 && !p.authStatus.configured && arr[index - 1].authStatus.configured;
                  return (
                    <Fragment key={p.id}>
                      {showDivider && (
                        <div className="flex items-center gap-3 pt-4 pb-1">
                          <div className="h-px bg-surface-hover flex-1" />
                          <span className="text-[10px] text-text-secondary uppercase tracking-widest font-semibold">
                            Unconnected
                          </span>
                          <div className="h-px bg-surface-hover flex-1" />
                        </div>
                      )}
                      <div className="bg-surface rounded-lg p-3 sm:p-4 flex items-center justify-between">
                        <div className="flex items-center gap-3 min-w-0">
                          <span
                            className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                              p.authStatus.configured ? "bg-success" : "bg-surface-hover"
                            }`}
                          />
                          <div className="min-w-0">
                            <div className="text-text-primary text-sm font-medium truncate">
                              {p.name}
                            </div>
                            <div className="text-text-secondary text-xs">
                              {p.models.length} model{p.models.length !== 1 ? "s" : ""}{" "}
                              {p.authStatus.configured
                                ? `- ${p.authStatus.source ?? "configured"}`
                                : "- no key set"}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                          {p.authStatus.configured ? (
                            <button
                              onClick={() => handleRemoveKey(p.id)}
                              className="text-xs text-text-secondary hover:text-error transition-colors px-2 py-1"
                            >
                              Remove
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                setSelectedProvider(p.id);
                                setApiKey("");
                                setError("");
                              }}
                              className="text-xs bg-accent text-bg font-semibold px-3 py-1.5 rounded-lg hover:opacity-90 transition-opacity"
                            >
                              Add Key
                            </button>
                          )}
                        </div>
                      </div>
                    </Fragment>
                  );
                })}
              </div>
            )}
          </div>

          <div className="pt-6 border-t border-surface-hover/30 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-text-primary font-semibold text-base">Environment Variables</h2>
                <p className="text-text-secondary text-[11px] mt-0.5">
                  Configure custom environment variables (e.g., GITHUB_TOKEN, NOTION_TOKEN) for your agent's shell activities.
                </p>
              </div>
              <button
                onClick={() => {
                  setIsAddingEnv(true);
                  setNewEnvKey("");
                  setNewEnvVal("");
                  setEnvError("");
                }}
                className="text-xs bg-accent text-bg font-semibold px-3 py-1.5 rounded-lg hover:opacity-90 transition-opacity flex-shrink-0 cursor-pointer"
              >
                Add Variable
              </button>
            </div>

            {envError && (
              <p className="text-error text-sm p-3 bg-surface rounded-lg">{envError}</p>
            )}

            {envLoading ? (
              <div className="flex justify-center py-8">
                <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              </div>
            ) : envVars.length === 0 ? (
              <div className="bg-surface rounded-lg p-6 text-center border border-surface-hover/10">
                <p className="text-text-secondary text-sm">No environment variables configured.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {envVars.map((v) => (
                  <div key={v.key} className="bg-surface rounded-lg p-3 sm:p-4 flex items-center justify-between border border-surface-hover/10">
                    <div className="min-w-0 flex-1 mr-4">
                      <div className="text-text-primary text-sm font-mono font-semibold truncate">
                        {v.key}
                      </div>
                      <div className="text-text-secondary text-xs font-mono mt-0.5">
                        {v.value}
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeleteEnvVar(v.key)}
                      className="text-xs text-text-secondary hover:text-error transition-colors px-2 py-1 flex-shrink-0 cursor-pointer font-semibold"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {selectedProvider && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-surface rounded-lg w-full max-w-sm p-4 sm:p-6 space-y-4">
            <h3 className="text-text-primary font-semibold text-sm">
              Set API Key for {providers.find((p) => p.id === selectedProvider)?.name}
            </h3>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-..."
              autoFocus
              className="w-full px-3 py-2 bg-bg border border-surface-hover rounded-lg
                         text-text-primary placeholder-text-secondary outline-none
                         focus:border-accent transition-colors text-sm"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveKey();
                if (e.key === "Escape") setSelectedProvider(null);
              }}
            />
            {error && <p className="text-error text-xs">{error}</p>}
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setSelectedProvider(null)}
                className="px-3 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveKey}
                disabled={saving || !apiKey.trim()}
                className="px-4 py-2 text-sm bg-accent text-bg font-semibold rounded-lg
                           hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {isAddingEnv && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-surface rounded-lg w-full max-w-sm p-4 sm:p-6 space-y-4 border border-surface-hover/30">
            <h3 className="text-text-primary font-semibold text-sm">
              Add Environment Variable
            </h3>
            <div className="space-y-3">
              <div>
                <label className="text-text-secondary text-[11px] block mb-1">Variable Name</label>
                <input
                  type="text"
                  value={newEnvKey}
                  onChange={(e) => setNewEnvKey(e.target.value)}
                  placeholder="GITHUB_TOKEN"
                  autoFocus
                  className="w-full px-3 py-2 bg-bg border border-surface-hover rounded-lg
                             text-text-primary placeholder-text-secondary outline-none
                             focus:border-accent transition-colors text-sm font-mono uppercase"
                />
              </div>
              <div>
                <label className="text-text-secondary text-[11px] block mb-1">Value</label>
                <input
                  type="password"
                  value={newEnvVal}
                  onChange={(e) => setNewEnvVal(e.target.value)}
                  placeholder="Enter value"
                  className="w-full px-3 py-2 bg-bg border border-surface-hover rounded-lg
                             text-text-primary placeholder-text-secondary outline-none
                             focus:border-accent transition-colors text-sm"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveEnvVar();
                    if (e.key === "Escape") setIsAddingEnv(false);
                  }}
                />
              </div>
            </div>
            {envError && <p className="text-error text-xs">{envError}</p>}
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setIsAddingEnv(false)}
                className="px-3 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEnvVar}
                disabled={savingEnv || !newEnvKey.trim() || !newEnvVal.trim()}
                className="px-4 py-2 text-sm bg-accent text-bg font-semibold rounded-lg
                           hover:opacity-90 disabled:opacity-50 transition-opacity cursor-pointer"
              >
                {savingEnv ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
