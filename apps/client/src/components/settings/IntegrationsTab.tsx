import { useState, useEffect, useCallback } from "react";
import type { IntegrationTemplate, QuickAction } from "shared";
import { useLiterals } from "@/lib";
import { literals as u } from "./IntegrationsTab.literals";

interface EnvVar {
  key: string;
  value: string;
}

interface IntegrationsTabProps {
  token: string | null;
  envVars: EnvVar[];
  fetchEnvVars: () => Promise<void>;
}

export function IntegrationsTab({
  token,
  envVars,
  fetchEnvVars,
}: IntegrationsTabProps) {
const l = useLiterals(u);
  const [templates, setTemplates] = useState<IntegrationTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [templatesError, setTemplatesError] = useState("");

  const [isConfiguringEnv, setIsConfiguringEnv] = useState<{
    integrationId: string;
    envVar: string;
  } | null>(null);
  const [configuringEnvVal, setConfiguringEnvVal] = useState("");
  const [savingConfigEnv, setSavingConfigEnv] = useState(false);

  const [isAddingIntegration, setIsAddingIntegration] = useState(false);
  const [newIntegrationId, setNewIntegrationId] = useState("");
  const [newIntegrationName, setNewIntegrationName] = useState("");
  const [newIntegrationDesc, setNewIntegrationDesc] = useState("");
  const [newIntegrationEnvVars, setNewIntegrationEnvVars] = useState("");
  const [newIntegrationRepoVars, setNewIntegrationRepoVars] = useState("");

  const [isAddingAction, setIsAddingAction] = useState<string | null>(null);
  const [newActionId, setNewActionId] = useState("");
  const [newActionName, setNewActionName] = useState("");
  const [newActionPrompt, setNewActionPrompt] = useState("");
  const [newActionDesc, setNewActionDesc] = useState("");

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch("/api/integrations/templates", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load integration templates");
      const data = await res.json();
      setTemplates(data.templates ?? []);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "Error loading templates";
      setTemplatesError(errMsg);
    } finally {
      setTemplatesLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const handleSaveTemplates = async (updatedTemplates: IntegrationTemplate[]) => {
    setTemplatesError("");
    try {
      const res = await fetch("/api/integrations/templates", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ templates: updatedTemplates }),
      });
      if (!res.ok) throw new Error("Failed to save integrations");
      await fetchTemplates();
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "Error saving integrations";
      setTemplatesError(errMsg);
    }
  };

  const handleSaveConfigEnv = async () => {
    if (!isConfiguringEnv) return;
    const { envVar } = isConfiguringEnv;
    const formattedKey = envVar.trim().toUpperCase();
    if (!configuringEnvVal.trim()) return;

    setSavingConfigEnv(true);
    setTemplatesError("");
    try {
      const res = await fetch("/api/env", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ key: formattedKey, value: configuringEnvVal }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to save environment variable");
      }
      setConfiguringEnvVal("");
      setIsConfiguringEnv(null);
      await fetchEnvVars();
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "Error saving environment variable";
      setTemplatesError(errMsg);
    } finally {
      setSavingConfigEnv(false);
    }
  };

  const handleCreateIntegration = async () => {
    if (!newIntegrationId.trim() || !newIntegrationName.trim()) return;
    const newIntegration: IntegrationTemplate = {
      id: newIntegrationId.trim().toLowerCase(),
      name: newIntegrationName.trim(),
      description: newIntegrationDesc.trim() || undefined,
      requiredEnvVars: newIntegrationEnvVars
        .split(",")
        .map((v) => v.trim().toUpperCase())
        .filter(Boolean),
      requiredProjectVars: newIntegrationRepoVars
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean),
      actions: [],
    };

    const updated = [...templates, newIntegration];
    await handleSaveTemplates(updated);

    setNewIntegrationId("");
    setNewIntegrationName("");
    setNewIntegrationDesc("");
    setNewIntegrationEnvVars("");
    setNewIntegrationRepoVars("");
    setIsAddingIntegration(false);
  };

  const handleDeleteIntegration = async (integrationId: string) => {
    const updated = templates.filter((t) => t.id !== integrationId);
    await handleSaveTemplates(updated);
  };

  const handleAddAction = async (integrationId: string) => {
    if (!newActionId.trim() || !newActionName.trim() || !newActionPrompt.trim()) return;
    const newAction: QuickAction = {
      id: newActionId.trim(),
      name: newActionName.trim(),
      prompt: newActionPrompt.trim(),
      description: newActionDesc.trim() || undefined,
    };

    const updated = templates.map((t) => {
      if (t.id === integrationId) {
        return {
          ...t,
          actions: [...t.actions, newAction],
        };
      }
      return t;
    });

    await handleSaveTemplates(updated);

    setNewActionId("");
    setNewActionName("");
    setNewActionPrompt("");
    setNewActionDesc("");
    setIsAddingAction(null);
  };

  const handleDeleteAction = async (integrationId: string, actionId: string) => {
    const updated = templates.map((t) => {
      if (t.id === integrationId) {
        return {
          ...t,
          actions: t.actions.filter((a) => a.id !== actionId),
        };
      }
      return t;
    });
    await handleSaveTemplates(updated);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-foreground font-semibold text-base">{l.title}</h2>
          <p className="text-muted-foreground text-[11px] mt-0.5">
            Connect infrastructure providers dynamically and customize workflow-specific quick actions.
          </p>
        </div>
        <button
          onClick={() => setIsAddingIntegration(true)}
          className="text-xs bg-primary text-background font-semibold px-3 py-1.5 rounded-lg hover:opacity-90 transition-opacity flex-shrink-0 cursor-pointer"
        >
          Add Custom Integration
        </button>
      </div>

      {templatesError && (
        <p className="text-destructive text-sm p-3 bg-card rounded-lg">{templatesError}</p>
      )}

      {templatesLoading ? (
        <div className="flex justify-center py-8">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : templates.length === 0 ? (
        <div className="bg-card rounded-lg p-6 text-center border border-input/10">
          <p className="text-muted-foreground text-sm">{l.noIntegrations}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {templates.map((integration) => {
            const isConnected = integration.requiredEnvVars.every((reqVar) =>
              envVars.some((ev) => ev.key === reqVar && ev.value !== "")
            );

            return (
              <div key={integration.id} className="bg-card rounded-lg border border-input/30 overflow-hidden">
                <div className="p-4 bg-card-hover/10 border-b border-input/30 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-foreground text-sm font-semibold">{integration.name}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        isConnected ? "bg-primary/10 text-primary border border-success/20" : "bg-warning/10 text-warning border border-warning/20"
                      }`}>
                        {isConnected ? "Connected" : "Disconnected"}
                      </span>
                    </div>
                    {integration.description && (
                      <p className="text-muted-foreground text-[11px] mt-1">{integration.description}</p>
                    )}
                  </div>
                  <button
                    onClick={() => handleDeleteIntegration(integration.id)}
                    className="text-xs text-muted-foreground hover:text-destructive transition-colors px-2 py-1 font-semibold cursor-pointer"
                  >
                    Delete
                  </button>
                </div>

                <div className="p-4 space-y-4">
                  <div>
                    <h4 className="text-muted-foreground text-xs font-semibold uppercase tracking-wider mb-2">Required Credentials</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {integration.requiredEnvVars.map((envVar) => {
                        const configured = envVars.some((ev) => ev.key === envVar);
                        return (
                          <div key={envVar} className="bg-background/40 rounded-lg p-2 flex items-center justify-between border border-input/20">
                            <span className="text-xs font-mono text-foreground">{envVar}</span>
                            <button
                              onClick={() => {
                                setIsConfiguringEnv({ integrationId: integration.id, envVar });
                                setConfiguringEnvVal("");
                              }}
                              className={`text-xs px-2.5 py-1 rounded transition-colors font-semibold cursor-pointer ${
                                configured ? "bg-card-hover hover:bg-card-hover/80 text-muted-foreground hover:text-foreground" : "bg-primary/10 hover:bg-primary/25 text-primary"
                              }`}
                            >
                                {configured ? "Update Key" : "Set Key"}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">Quick Actions</h4>
                      <button
                        onClick={() => {
                          setIsAddingAction(integration.id);
                          setNewActionId("");
                          setNewActionName("");
                          setNewActionPrompt("");
                          setNewActionDesc("");
                        }}
                        className="text-xs text-primary hover:underline font-semibold cursor-pointer"
                      >
                        + Add Action
                      </button>
                    </div>
                    {integration.actions.length === 0 ? (
                      <p className="text-muted-foreground text-[11px]">No actions defined for this integration.</p>
                    ) : (
                      <div className="space-y-2">
                        {integration.actions.map((action) => (
                          <div key={action.id} className="bg-background/40 border border-input/20 rounded-lg p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-foreground text-xs font-semibold">{action.name}</div>
                              {action.description && (
                                <p className="text-muted-foreground text-xs mt-0.5">{action.description}</p>
                              )}
                              <div className="text-xs text-primary font-mono mt-1 truncate bg-background/50 px-2 py-0.5 rounded border border-input/10 max-w-lg">
                                {action.prompt}
                              </div>
                            </div>
                            <button
                              onClick={() => handleDeleteAction(integration.id, action.id)}
                              className="text-xs text-muted-foreground hover:text-destructive transition-colors px-2 py-1 flex-shrink-0 font-semibold cursor-pointer text-left sm:text-right"
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
            );
          })}
        </div>
      )}

      {isConfiguringEnv && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-card rounded-lg w-full max-w-sm p-4 sm:p-6 space-y-4 border border-input/30">
            <h3 className="text-foreground font-semibold text-sm">
              Configure {isConfiguringEnv.envVar}
            </h3>
            <input
              type="password"
              value={configuringEnvVal}
              onChange={(e) => setConfiguringEnvVal(e.target.value)}
              placeholder="Enter value"
              autoFocus
              className="w-full px-3 py-2 bg-background border border-input rounded-lg
                         text-foreground placeholder-text-secondary outline-none
                         focus:border-primary transition-colors text-sm"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveConfigEnv();
                if (e.key === "Escape") setIsConfiguringEnv(null);
              }}
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setIsConfiguringEnv(null)}
                className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveConfigEnv}
                disabled={savingConfigEnv || !configuringEnvVal.trim()}
                className="px-4 py-2 text-sm bg-primary text-background font-semibold rounded-lg
                           hover:opacity-90 disabled:opacity-50 transition-opacity cursor-pointer"
              >
                {savingConfigEnv ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {isAddingIntegration && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-card rounded-lg w-full max-w-md p-4 sm:p-6 space-y-4 border border-input/30">
            <h3 className="text-foreground font-semibold text-sm">Add Custom Integration</h3>
            <div className="space-y-3 text-xs">
              <div>
                <label className="text-muted-foreground text-[11px] block mb-1">Integration ID</label>
                <input
                  type="text"
                  value={newIntegrationId}
                  onChange={(e) => setNewIntegrationId(e.target.value)}
                  placeholder="dokploy"
                  className="w-full px-3 py-2 bg-background border border-input rounded-lg
                             text-foreground placeholder-text-secondary outline-none focus:border-primary transition-colors text-sm"
                />
              </div>
              <div>
                <label className="text-muted-foreground text-[11px] block mb-1">Name</label>
                <input
                  type="text"
                  value={newIntegrationName}
                  onChange={(e) => setNewIntegrationName(e.target.value)}
                  placeholder="Dokploy"
                  className="w-full px-3 py-2 bg-background border border-input rounded-lg
                             text-foreground placeholder-text-secondary outline-none focus:border-primary transition-colors text-sm"
                />
              </div>
              <div>
                <label className="text-muted-foreground text-[11px] block mb-1">Description</label>
                <input
                  type="text"
                  value={newIntegrationDesc}
                  onChange={(e) => setNewIntegrationDesc(e.target.value)}
                  placeholder="Manage self-hosted servers..."
                  className="w-full px-3 py-2 bg-background border border-input rounded-lg
                             text-foreground placeholder-text-secondary outline-none focus:border-primary transition-colors text-sm"
                />
              </div>
              <div>
                <label className="text-muted-foreground text-[11px] block mb-1">Required Env Variables (comma-separated)</label>
                <input
                  type="text"
                  value={newIntegrationEnvVars}
                  onChange={(e) => setNewIntegrationEnvVars(e.target.value)}
                  placeholder="DOKPLOY_API_KEY, DOKPLOY_URL"
                  className="w-full px-3 py-2 bg-background border border-input rounded-lg
                             text-foreground placeholder-text-secondary outline-none focus:border-primary transition-colors text-sm font-mono uppercase"
                />
              </div>
              <div>
                <label className="text-muted-foreground text-[11px] block mb-1">Required Repo Context Variables (comma-separated)</label>
                <input
                  type="text"
                  value={newIntegrationRepoVars}
                  onChange={(e) => setNewIntegrationRepoVars(e.target.value)}
                  placeholder="dokployAppId"
                  className="w-full px-3 py-2 bg-background border border-input rounded-lg
                             text-foreground placeholder-text-secondary outline-none focus:border-primary transition-colors text-sm font-mono"
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setIsAddingIntegration(false)}
                className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateIntegration}
                disabled={!newIntegrationId.trim() || !newIntegrationName.trim()}
                className="px-4 py-2 text-sm bg-primary text-background font-semibold rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity cursor-pointer"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {isAddingAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-card rounded-lg w-full max-w-md p-4 sm:p-6 space-y-4 border border-input/30">
            <h3 className="text-foreground font-semibold text-sm">Add Quick Action</h3>
            <div className="space-y-3 text-xs">
              <div>
                <label className="text-muted-foreground text-[11px] block mb-1">Action ID</label>
                <input
                  type="text"
                  value={newActionId}
                  onChange={(e) => setNewActionId(e.target.value)}
                  placeholder="deploy_prod"
                  className="w-full px-3 py-2 bg-background border border-input rounded-lg
                             text-foreground placeholder-text-secondary outline-none focus:border-primary transition-colors text-sm font-mono"
                />
              </div>
              <div>
                <label className="text-muted-foreground text-[11px] block mb-1">Name</label>
                <input
                  type="text"
                  value={newActionName}
                  onChange={(e) => setNewActionName(e.target.value)}
                  placeholder="Deploy to Production"
                  className="w-full px-3 py-2 bg-background border border-input rounded-lg
                             text-foreground placeholder-text-secondary outline-none focus:border-primary transition-colors text-sm"
                />
              </div>
              <div>
                <label className="text-muted-foreground text-[11px] block mb-1">Description</label>
                <input
                  type="text"
                  value={newActionDesc}
                  onChange={(e) => setNewActionDesc(e.target.value)}
                  placeholder="Trigger full deployment..."
                  className="w-full px-3 py-2 bg-background border border-input rounded-lg
                             text-foreground placeholder-text-secondary outline-none focus:border-primary transition-colors text-sm"
                />
              </div>
              <div>
                <label className="text-muted-foreground text-[11px] block mb-1">Prompt Template</label>
                <textarea
                  value={newActionPrompt}
                  onChange={(e) => setNewActionPrompt(e.target.value)}
                  placeholder="Deploy application using appId: {dokployAppId}."
                  rows={3}
                  className="w-full px-3 py-2 bg-background border border-input rounded-lg
                             text-foreground placeholder-text-secondary outline-none focus:border-primary transition-colors text-sm font-mono"
                />
                <p className="text-xs text-muted-foreground mt-1">Use braces to enclose repo-specific context variables (e.g. &#123;dokployAppId&#125;).</p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setIsAddingAction(null)}
                className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => handleAddAction(isAddingAction)}
                disabled={!newActionId.trim() || !newActionName.trim() || !newActionPrompt.trim()}
                className="px-4 py-2 text-sm bg-primary text-background font-semibold rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity cursor-pointer"
              >
                Add Action
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
