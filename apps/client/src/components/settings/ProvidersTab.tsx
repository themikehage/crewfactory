import { useState, useEffect, useCallback, Fragment } from "react";
import { useLiterals } from "@/lib";
import { literals as u } from "./ProvidersTab.literals";
import { apiFetch } from "@/lib/api";

interface ModelInfo {
  id: string;
  name: string;
  reasoning: boolean;
  input?: string[];
  contextWindow?: number;
}

interface ProviderInfo {
  id: string;
  name: string;
  authStatus: { configured: boolean; source?: string };
  models: ModelInfo[];
}

export function ProvidersTab() {
const l = useLiterals(u);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState<Record<string, boolean>>({});
  const [infoProvider, setInfoProvider] = useState<ProviderInfo | null>(null);

  const fetchProviders = useCallback(async () => {
    try {
      const res = await apiFetch("/api/providers");
      if (!res.ok) throw new Error("Failed to load providers");
      const data = await res.json();
      const sorted = (data.providers ?? []).sort((a: ProviderInfo, b: ProviderInfo) => {
        if (a.authStatus.configured && !b.authStatus.configured) return -1;
        if (!a.authStatus.configured && b.authStatus.configured) return 1;
        return a.name.localeCompare(b.name);
      });
      setProviders(sorted);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "Error loading providers";
      setError(errMsg);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleRefreshModels = async (providerId: string) => {
    setRefreshing((prev) => ({ ...prev, [providerId]: true }));
    setError("");
    try {
      const res = await apiFetch(`/api/providers/${providerId}/refresh`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to refresh models");
      }
      await fetchProviders();
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "Error refreshing models";
      setError(errMsg);
    } finally {
      setRefreshing((prev) => ({ ...prev, [providerId]: false }));
    }
  };

  useEffect(() => {
    fetchProviders();
  }, [fetchProviders]);

  const handleSaveKey = async () => {
    if (!selectedProvider || !apiKey.trim()) return;
    setSaving(true);
    setError("");
    try {
      const res = await apiFetch(`/api/providers/${selectedProvider}/key`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ apiKey }),
      });
      if (!res.ok) throw new Error("Failed to save API key");
      setApiKey("");
      setSelectedProvider(null);
      await fetchProviders();
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "Error saving key";
      setError(errMsg);
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveKey = async (providerId: string) => {
    setError("");
    try {
      const res = await apiFetch(`/api/providers/${providerId}/key`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to remove API key");
      await fetchProviders();
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "Error removing key";
      setError(errMsg);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-foreground font-semibold text-base">{l.title}</h2>
          <p className="text-muted-foreground text-[11px] mt-0.5">
            {l.subtitle}
          </p>
        </div>
      </div>
      {error && (
        <p className="text-destructive text-sm mb-4 p-3 bg-card rounded-lg">{error}</p>
      )}
      <div className="relative mb-4">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z"
          />
        </svg>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={l.searchPlaceholder}
          className="w-full pl-10 pr-3 py-2 bg-card border border-input rounded-lg
                     text-foreground placeholder-text-secondary outline-none
                     focus:border-primary transition-colors text-sm"
        />
      </div>
      {loading ? (
        <div className="flex justify-center py-8">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-3">
          {providers
            .filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
            .map((p, index, arr) => {
              const showDivider =
                index > 0 &&
                !p.authStatus.configured &&
                arr[index - 1].authStatus.configured;
              return (
                <Fragment key={p.id}>
                  {showDivider && (
                    <div className="flex items-center gap-3 pt-4 pb-1">
                      <div className="h-px bg-card-hover flex-1" />
                      <span className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">
                        Unconnected
                      </span>
                      <div className="h-px bg-card-hover flex-1" />
                    </div>
                  )}
                  <div className="bg-card rounded-lg p-3 sm:p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                          p.authStatus.configured ? "bg-primary" : "bg-card-hover"
                        }`}
                      />
                      <div className="min-w-0">
                        <div className="text-foreground text-sm font-medium truncate">
                          {p.name}
                        </div>
                        <div className="text-muted-foreground text-xs">
                          {p.models.length} model{p.models.length !== 1 ? "s" : ""}{" "}
                          {p.authStatus.configured
                            ? `- ${p.authStatus.source ?? "configured"}`
                            : "- no key set"}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2.5 flex-shrink-0 ml-3">
                      {p.authStatus.configured ? (
                        <>
                          <button
                            onClick={() => setInfoProvider(p)}
                            className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2.5 py-1.5 cursor-pointer font-semibold flex items-center gap-1 border border-input rounded-lg bg-background"
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="12" cy="12" r="10"></circle>
                              <line x1="12" y1="16" x2="12" y2="12"></line>
                              <line x1="12" y1="8" x2="12.01" y2="8"></line>
                            </svg>
                            {l.infoBtn}
                          </button>
                          <button
                            onClick={() => handleRefreshModels(p.id)}
                            disabled={refreshing[p.id]}
                            className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2.5 py-1.5 cursor-pointer font-semibold flex items-center gap-1 border border-input rounded-lg bg-background disabled:opacity-50"
                          >
                            {refreshing[p.id] ? (
                              <div className="w-3 h-3 border-2 border-muted-foreground border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path>
                              </svg>
                            )}
                            {l.syncBtn}
                          </button>
                          <button
                            onClick={() => handleRemoveKey(p.id)}
                            className="text-xs text-muted-foreground hover:text-destructive transition-colors px-2 py-1 cursor-pointer font-semibold ml-1"
                          >
                            Remove
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => {
                            setSelectedProvider(p.id);
                            setApiKey("");
                            setError("");
                          }}
                          className="text-xs bg-primary text-background font-semibold px-3 py-1.5 rounded-lg hover:opacity-90 transition-opacity cursor-pointer"
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

      {selectedProvider && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-card rounded-lg w-full max-w-sm p-4 sm:p-6 space-y-4">
            <h3 className="text-foreground font-semibold text-sm">
              Set API Key for {providers.find((p) => p.id === selectedProvider)?.name}
            </h3>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-..."
              autoFocus
              className="w-full px-3 py-2 bg-background border border-input rounded-lg
                         text-foreground placeholder-text-secondary outline-none
                         focus:border-primary transition-colors text-sm"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveKey();
                if (e.key === "Escape") setSelectedProvider(null);
              }}
            />
            {error && <p className="text-destructive text-xs">{error}</p>}
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setSelectedProvider(null)}
                className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveKey}
                disabled={saving || !apiKey.trim()}
                className="px-4 py-2 text-sm bg-primary text-background font-semibold rounded-lg
                           hover:opacity-90 disabled:opacity-50 transition-opacity cursor-pointer"
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {infoProvider && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onKeyDown={(e) => { if (e.key === "Escape") setInfoProvider(null); }}
        >
          <div className="bg-card border border-border rounded-xl w-full max-w-2xl p-6 shadow-2xl flex flex-col max-h-[85vh] relative animate-in fade-in zoom-in-95 duration-200">
            <button
              onClick={() => setInfoProvider(null)}
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors p-1 rounded-lg hover:bg-card-hover"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>

            <div className="space-y-1 pr-8">
              <h3 className="text-foreground font-semibold text-lg">
                {l.modalTitle.replace("{provider}", infoProvider.name)}
              </h3>
              <p className="text-muted-foreground text-xs">
                {l.modalSubtitle}
              </p>
            </div>

            <div className="mt-6 overflow-y-auto flex-1 border border-card-hover rounded-lg bg-background">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-card-hover bg-card text-muted-foreground font-medium">
                    <th className="p-3">{l.thName}</th>
                    <th className="p-3">{l.thId}</th>
                    <th className="p-3 text-center">{l.thContext}</th>
                    <th className="p-3 text-center">{l.thCapabilities}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-card-hover">
                  {infoProvider.models.map((m) => {
                    const hasVision = m.input?.includes("image");
                    return (
                      <tr key={m.id} className="hover:bg-card-hover transition-colors">
                        <td className="p-3 font-medium text-foreground">{m.name}</td>
                        <td className="p-3 text-muted-foreground font-mono text-[10px]">{m.id}</td>
                        <td className="p-3 text-center text-foreground">{m.contextWindow ? `${Math.round(m.contextWindow / 1000)}K` : "128K"}</td>
                        <td className="p-3">
                          <div className="flex items-center justify-center gap-1.5 flex-wrap">
                            {m.reasoning && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                                Reasoning
                              </span>
                            )}
                            {hasVision && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-500/15 text-blue-400 border border-blue-500/25">
                                Vision
                              </span>
                            )}
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-card-hover text-muted-foreground border border-input">
                              Text
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end mt-6">
              <button
                onClick={() => setInfoProvider(null)}
                className="px-4 py-2 text-sm bg-primary text-background font-semibold rounded-lg hover:opacity-90 transition-opacity cursor-pointer"
              >
                {l.closeBtn}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
