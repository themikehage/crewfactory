import { useState, useEffect, useCallback } from "react";
import type { IntegrationTemplate } from "shared";

interface Props {
  activeRepoName: string | null;
  onSendPrompt: (prompt: string) => void;
}

export function InfrastructurePanel({ activeRepoName, onSendPrompt }: Props) {
  const [templates, setTemplates] = useState<IntegrationTemplate[]>([]);
  const [globalEnv, setGlobalEnv] = useState<Array<{ key: string; value: string }>>([]);
  const [bindings, setBindings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const token = localStorage.getItem("token");

  const fetchData = useCallback(async () => {
    if (!activeRepoName) return;
    setLoading(true);
    setError("");
    try {
      const [tplRes, envRes, bindRes] = await Promise.all([
        fetch("/api/integrations/templates", {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch("/api/env", {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`/api/integrations/bindings/${activeRepoName}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (!tplRes.ok || !envRes.ok || !bindRes.ok) {
        throw new Error("Failed to load infrastructure context data");
      }

      const tplData = await tplRes.json();
      const envData = await envRes.json();
      const bindData = await bindRes.json();

      setTemplates(tplData.templates ?? []);
      setGlobalEnv(envData.env ?? []);
      setBindings(bindData.bindings ?? {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error loading data");
    } finally {
      setLoading(false);
    }
  }, [activeRepoName, token]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSaveBindings = async () => {
    if (!activeRepoName) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/integrations/bindings/${activeRepoName}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(bindings),
      });

      if (!res.ok) throw new Error("Failed to save repository linkages");
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error saving linkages");
    } finally {
      setSaving(false);
    }
  };

  const handleTriggerAction = (promptTemplate: string) => {
    let expanded = promptTemplate;
    const matches = promptTemplate.match(/\{[a-zA-Z0-9_]+\}/g) || [];
    for (const match of matches) {
      const varName = match.slice(1, -1);
      const val = bindings[varName] || "";
      expanded = expanded.replace(match, val);
    }
    onSendPrompt(expanded);
  };

  if (!activeRepoName) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-text-secondary">
        <p className="text-xs leading-relaxed">
          Infrastructure actions are context-specific. Select a repository from the Dashboard to link infrastructure context and run quick actions.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center py-12">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const connectedIntegrations = templates.filter((t) =>
    t.requiredEnvVars.every((reqVar) =>
      globalEnv.some((ge) => ge.key === reqVar && ge.value !== "")
    )
  );

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-h-0">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {error && (
          <p className="text-error text-xs p-3 bg-error/10 border border-error/20 rounded-lg">{error}</p>
        )}

        {connectedIntegrations.length === 0 ? (
          <div className="text-center py-6 border border-dashed border-surface-hover rounded-lg">
            <p className="text-text-secondary text-xs p-3">
              No active integrations found. Go to Settings and configure the Integrations Hub first.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {connectedIntegrations.map((integration) => {
              const hasRepoVars = integration.requiredRepoVars.length > 0;
              return (
                <div key={integration.id} className="bg-bg/40 border border-surface-hover/30 rounded-lg p-3.5 space-y-3">
                  <div className="flex items-center justify-between border-b border-surface-hover/20 pb-2">
                    <span className="text-xs font-semibold text-text-primary">{integration.name}</span>
                    <span className="text-[9px] bg-success/15 border border-success/20 text-success px-2 py-0.5 rounded-full font-medium">
                      Connected
                    </span>
                  </div>

                  {hasRepoVars && (
                    <div className="space-y-2">
                      <span className="text-[10px] text-text-secondary uppercase font-bold tracking-wider">
                        Repository Bindings
                      </span>
                      <div className="space-y-2.5">
                        {integration.requiredRepoVars.map((repoVar) => (
                          <div key={repoVar} className="space-y-1">
                            <label className="text-[10px] text-text-secondary font-mono block">
                              {repoVar}
                            </label>
                            <input
                              type="text"
                              value={bindings[repoVar] || ""}
                              onChange={(e) =>
                                setBindings((prev) => ({
                                  ...prev,
                                  [repoVar]: e.target.value,
                                }))
                              }
                              placeholder={`Enter ${repoVar}`}
                              className="w-full px-2.5 py-1.5 bg-bg border border-surface-hover/30 rounded text-xs text-text-primary placeholder-text-secondary/50 outline-none focus:border-accent font-mono"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {integration.actions.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      <span className="text-[10px] text-text-secondary uppercase font-bold tracking-wider block">
                        Quick Actions
                      </span>
                      <div className="grid grid-cols-1 gap-2">
                        {integration.actions.map((action) => {
                          const missingVars = (action.prompt.match(/\{[a-zA-Z0-9_]+\}/g) || [])
                            .map((m) => m.slice(1, -1))
                            .filter((v) => !bindings[v] || bindings[v].trim() === "");

                          const disabled = missingVars.length > 0;

                          return (
                            <button
                              key={action.id}
                              onClick={() => handleTriggerAction(action.prompt)}
                              disabled={disabled}
                              title={disabled ? `Requires: ${missingVars.join(", ")}` : action.description}
                              className="w-full text-left py-2 px-3 border border-surface-hover hover:border-accent hover:bg-accent/5 rounded cursor-pointer disabled:opacity-30 disabled:pointer-events-none transition-all text-xs flex flex-col gap-0.5"
                            >
                              <span className="font-semibold text-text-primary">{action.name}</span>
                              {action.description && (
                                <span className="text-[10px] text-text-secondary">{action.description}</span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {connectedIntegrations.some((t) => t.requiredRepoVars.length > 0) && (
        <div className="p-3 border-t border-surface-hover bg-bg/20 flex justify-end flex-shrink-0">
          <button
            onClick={handleSaveBindings}
            disabled={saving}
            className="text-xs bg-accent text-bg font-semibold px-4 py-2 rounded hover:opacity-90 disabled:opacity-50 transition-opacity cursor-pointer"
          >
            {saving ? "Saving Linkages..." : "Save Bindings"}
          </button>
        </div>
      )}
    </div>
  );
}
