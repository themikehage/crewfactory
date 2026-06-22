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

  useEffect(() => {
    fetchProviders();
  }, [fetchProviders]);

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
    </div>
  );
}
