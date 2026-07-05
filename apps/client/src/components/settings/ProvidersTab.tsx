import { useState, useEffect, useCallback, Fragment } from "react";
import { useLiterals } from "@/lib";
import { literals as u } from "./ProvidersTab.literals";

interface ModelInfo {
  id: string;
  name: string;
  reasoning: boolean;
}

interface ProviderInfo {
  id: string;
  name: string;
  authStatus: { configured: boolean; source?: string };
  models: ModelInfo[];
}

interface ProvidersTabProps {
  token: string | null;
}

export function ProvidersTab({ token }: ProvidersTabProps) {
const l = useLiterals(u);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

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
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "Error loading providers";
      setError(errMsg);
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
    setError("");
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
      const res = await fetch(`/api/providers/${providerId}/key`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
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
                    <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                      {p.authStatus.configured ? (
                        <button
                          onClick={() => handleRemoveKey(p.id)}
                          className="text-xs text-muted-foreground hover:text-destructive transition-colors px-2 py-1 cursor-pointer font-semibold"
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
    </div>
  );
}
