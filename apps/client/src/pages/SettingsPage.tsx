import { useState, useEffect, useCallback, Fragment } from "react";
import { useAuth } from "@/contexts/AuthContext";
import type { IntegrationTemplate, QuickAction } from "shared";

interface ProviderInfo {
  id: string;
  name: string;
  authStatus: { configured: boolean; source?: string };
  models: Array<{ id: string; name: string; reasoning: boolean }>;
}

export function SettingsPage() {
  const { user, logout, changePassword } = useAuth();
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
  const [activeTab, setActiveTab] = useState<"general" | "providers" | "env" | "integrations">("providers");
  const [isDevView, setIsDevView] = useState(false);
  const [bulkEnvText, setBulkEnvText] = useState("");
  const [isRevealed, setIsRevealed] = useState(false);

  const [templates, setTemplates] = useState<IntegrationTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [templatesError, setTemplatesError] = useState("");
  const [isConfiguringEnv, setIsConfiguringEnv] = useState<{ integrationId: string; envVar: string } | null>(null);
  const [configuringEnvVal, setConfiguringEnvVal] = useState("");
  const [savingConfigEnv, setSavingConfigEnv] = useState(false);

  const [isAddingIntegration, setIsAddingIntegration] = useState(false);
  const [newIntegrationId, setNewIntegrationId] = useState("");
  const [newIntegrationName, setNewIntegrationName] = useState("");
  const [newIntegrationDesc, setNewIntegrationDesc] = useState("");
  const [newIntegrationEnvVars, setNewIntegrationEnvVars] = useState("");
  const [newIntegrationRepoVars, setNewIntegrationRepoVars] = useState("");

  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState(false);

  const [isAddingAction, setIsAddingAction] = useState<string | null>(null);
  const [newActionId, setNewActionId] = useState("");
  const [newActionName, setNewActionName] = useState("");
  const [newActionPrompt, setNewActionPrompt] = useState("");
  const [newActionDesc, setNewActionDesc] = useState("");

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

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch("/api/integrations/templates", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load integration templates");
      const data = await res.json();
      setTemplates(data.templates ?? []);
    } catch (err) {
      setTemplatesError(err instanceof Error ? err.message : "Error loading templates");
    } finally {
      setTemplatesLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchProviders();
    fetchEnvVars();
    fetchTemplates();
  }, [fetchProviders, fetchEnvVars, fetchTemplates]);

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

  const handleToggleDevView = () => {
    if (isDevView) {
      setIsDevView(false);
      setIsRevealed(false);
      setEnvError("");
    } else {
      const text = envVars.map((v) => `${v.key}=${v.value}`).join("\n");
      setBulkEnvText(text);
      setIsDevView(true);
      setIsRevealed(false);
      setEnvError("");
    }
  };

  const handleToggleReveal = async () => {
    if (isRevealed) {
      const text = envVars.map((v) => `${v.key}=${v.value}`).join("\n");
      setBulkEnvText(text);
      setIsRevealed(false);
    } else {
      setEnvLoading(true);
      setEnvError("");
      try {
        const res = await fetch("/api/env?reveal=true", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error("Failed to load environment variables");
        const data = await res.json();
        const unmaskedText = (data.env ?? []).map((v: { key: string; value: string }) => `${v.key}=${v.value}`).join("\n");
        setBulkEnvText(unmaskedText);
        setIsRevealed(true);
      } catch (err) {
        setEnvError(err instanceof Error ? err.message : "Error loading environment variables");
      } finally {
        setEnvLoading(false);
      }
    }
  };

  const handleSaveBulkEnv = async () => {
    setSavingEnv(true);
    setEnvError("");
    try {
      const lines = bulkEnvText.split("\n");
      const variables: Record<string, string> = {};

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line || line.startsWith("#")) {
          continue;
        }
        const eqIdx = line.indexOf("=");
        if (eqIdx === -1) {
          throw new Error(`Invalid format on line ${i + 1}: "${line}". Must be KEY=value`);
        }
        const key = line.slice(0, eqIdx).trim().toUpperCase();
        const value = line.slice(eqIdx + 1).trim();

        if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) {
          throw new Error(`Invalid key on line ${i + 1}: "${key}". Names must start with a letter or underscore and contain only alphanumeric characters or underscores.`);
        }
        if (!value) {
          throw new Error(`Value for key "${key}" cannot be empty. If you want to delete this variable, completely remove the line.`);
        }
        variables[key] = value;
      }

      const res = await fetch("/api/env", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ variables }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to update environment variables");
      }

      const data = await res.json();
      setEnvVars(data.env ?? []);
      setIsDevView(false);
      setIsRevealed(false);
    } catch (err) {
      setEnvError(err instanceof Error ? err.message : "Error saving environment variables");
    } finally {
      setSavingEnv(false);
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

  const handleSaveTemplates = async (updatedTemplates: IntegrationTemplate[]) => {
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
    } catch (err) {
      setTemplatesError(err instanceof Error ? err.message : "Error saving integrations");
    }
  };

  const handleSaveConfigEnv = async () => {
    if (!isConfiguringEnv) return;
    const { envVar } = isConfiguringEnv;
    const formattedKey = envVar.trim().toUpperCase();
    if (!configuringEnvVal.trim()) return;

    setSavingConfigEnv(true);
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
    } catch (err) {
      setTemplatesError(err instanceof Error ? err.message : "Error saving environment variable");
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
      requiredEnvVars: newIntegrationEnvVars.split(",").map(v => v.trim().toUpperCase()).filter(Boolean),
      requiredRepoVars: newIntegrationRepoVars.split(",").map(v => v.trim()).filter(Boolean),
      actions: []
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
    const updated = templates.filter(t => t.id !== integrationId);
    await handleSaveTemplates(updated);
  };

  const handleAddAction = async (integrationId: string) => {
    if (!newActionId.trim() || !newActionName.trim() || !newActionPrompt.trim()) return;
    const newAction: QuickAction = {
      id: newActionId.trim(),
      name: newActionName.trim(),
      prompt: newActionPrompt.trim(),
      description: newActionDesc.trim() || undefined
    };

    const updated = templates.map(t => {
      if (t.id === integrationId) {
        return {
          ...t,
          actions: [...t.actions, newAction]
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
    const updated = templates.map(t => {
      if (t.id === integrationId) {
        return {
          ...t,
          actions: t.actions.filter(a => a.id !== actionId)
        };
      }
      return t;
    });
    await handleSaveTemplates(updated);
  };

  const tabs = [
    { id: "providers", label: "LLM Providers" },
    { id: "env", label: "Env Variables" },
    { id: "integrations", label: "Integrations Hub" },
    { id: "general", label: "General & Account" },
  ] as const;

  return (
    <div className="h-full flex flex-col bg-bg">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto p-3 sm:p-6 space-y-6">
          
          <div className="flex border-b border-surface-hover/30 mb-6 gap-2 pb-1.5 w-full overflow-x-auto scrollbar-none flex-nowrap">
            {tabs.map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-none px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-all whitespace-nowrap cursor-pointer ${
                    active
                      ? "text-accent bg-accent/10 border border-accent/25"
                      : "text-text-secondary hover:text-text-primary hover:bg-surface-hover/20 border border-transparent"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {activeTab === "general" && (
            <div className="space-y-6">
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

              <div className="bg-surface rounded-lg p-4 border border-surface-hover/30">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-text-primary font-semibold text-sm">Password</h3>
                  {!showPasswordForm && (
                    <button
                      onClick={() => { setShowPasswordForm(true); setPwError(""); setPwSuccess(false); }}
                      className="text-xs bg-accent/10 text-accent hover:bg-accent/20 border border-accent/25 px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer"
                    >
                      Change
                    </button>
                  )}
                </div>
                {showPasswordForm && (
                  <div className="space-y-3">
                    <input
                      type="password"
                      placeholder="Current password"
                      value={pwCurrent}
                      onChange={(e) => setPwCurrent(e.target.value)}
                      className="w-full px-3 py-2 bg-bg border border-surface-hover rounded-lg text-text-primary placeholder-text-secondary outline-none focus:border-accent transition-colors text-sm"
                    />
                    <input
                      type="password"
                      placeholder="New password"
                      value={pwNew}
                      onChange={(e) => setPwNew(e.target.value)}
                      className="w-full px-3 py-2 bg-bg border border-surface-hover rounded-lg text-text-primary placeholder-text-secondary outline-none focus:border-accent transition-colors text-sm"
                    />
                    <input
                      type="password"
                      placeholder="Confirm new password"
                      value={pwConfirm}
                      onChange={(e) => setPwConfirm(e.target.value)}
                      className="w-full px-3 py-2 bg-bg border border-surface-hover rounded-lg text-text-primary placeholder-text-secondary outline-none focus:border-accent transition-colors text-sm"
                    />
                    {pwError && <p className="text-error text-xs">{pwError}</p>}
                    {pwSuccess && <p className="text-success text-xs">Password updated successfully.</p>}
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => { setShowPasswordForm(false); setPwCurrent(""); setPwNew(""); setPwConfirm(""); setPwError(""); setPwSuccess(false); }}
                        className="text-xs bg-surface-hover/20 text-text-secondary hover:text-text-primary border border-surface-hover/30 px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={async () => {
                          if (!pwCurrent || !pwNew || !pwConfirm) {
                            setPwError("All fields are required");
                            return;
                          }
                          if (pwNew !== pwConfirm) {
                            setPwError("New passwords do not match");
                            return;
                          }
                          if (pwNew.length < 8) {
                            setPwError("New password must be at least 8 characters");
                            return;
                          }
                          setPwSaving(true);
                          setPwError("");
                          setPwSuccess(false);
                          try {
                            await changePassword(pwCurrent, pwNew);
                            setPwSuccess(true);
                            setPwCurrent("");
                            setPwNew("");
                            setPwConfirm("");
                          } catch (err) {
                            setPwError(err instanceof Error ? err.message : "Failed to change password");
                          } finally {
                            setPwSaving(false);
                          }
                        }}
                        disabled={pwSaving}
                        className="text-xs bg-accent/10 text-accent hover:bg-accent/20 border border-accent/25 px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer disabled:opacity-50"
                      >
                        {pwSaving ? "Saving..." : "Save"}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="bg-surface rounded-lg p-4 border border-surface-hover/30 space-y-4">
                <h3 className="text-text-primary font-semibold text-sm">System Status</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div className="space-y-0.5">
                    <div className="text-text-secondary font-medium">API Base URL</div>
                    <div className="text-text-primary font-mono break-all">/api/v1</div>
                  </div>
                  <div className="space-y-0.5">
                    <div className="text-text-secondary font-medium">Session Storage</div>
                    <div className="text-text-primary">JWT + Server Filesystem</div>
                  </div>
                  <div className="space-y-0.5">
                    <div className="text-text-secondary font-medium">Workspace Context</div>
                    <div className="text-text-primary font-mono break-all">themikehage/crewfactory</div>
                  </div>
                  <div className="space-y-0.5">
                    <div className="text-text-secondary font-medium">Health Status</div>
                    <div className="text-success flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                      Online
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "providers" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-text-primary font-semibold text-base">Providers</h2>
                  <p className="text-text-secondary text-[11px] mt-0.5">
                    Configure API keys for LLM providers to use with the coding agent.
                  </p>
                </div>
              </div>
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
                                className="text-xs text-text-secondary hover:text-error transition-colors px-2 py-1 cursor-pointer font-semibold"
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
                                className="text-xs bg-accent text-bg font-semibold px-3 py-1.5 rounded-lg hover:opacity-90 transition-opacity cursor-pointer"
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
          )}

          {activeTab === "env" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-text-primary font-semibold text-base">Environment Variables</h2>
                  <p className="text-text-secondary text-[11px] mt-0.5">
                    Configure custom environment variables (e.g., GITHUB_TOKEN, NOTION_TOKEN) for your agent's shell activities.
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={handleToggleDevView}
                    className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all cursor-pointer ${
                      isDevView
                        ? "bg-accent/10 border-accent/25 text-accent"
                        : "bg-surface hover:bg-surface-hover/50 border-surface-hover/30 text-text-secondary hover:text-text-primary"
                    }`}
                  >
                    {isDevView ? "Standard View" : "Developer View"}
                  </button>
                  {!isDevView && (
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
                  )}
                </div>
              </div>

              {envError && (
                <p className="text-error text-sm p-3 bg-surface rounded-lg">{envError}</p>
              )}

              {envLoading ? (
                <div className="flex justify-center py-8">
                  <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                </div>
              ) : isDevView ? (
                <div className="space-y-4">
                  <div className="bg-surface rounded-lg p-3 sm:p-4 border border-surface-hover/30 space-y-3">
                    <div className="flex items-center justify-between border-b border-surface-hover/30 pb-2">
                      <span className="text-xs text-text-secondary font-medium font-mono">
                        .env Configuration
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={handleToggleReveal}
                          className="text-[10px] bg-surface-hover hover:bg-surface-hover/80 text-text-secondary hover:text-text-primary font-semibold px-2 py-0.5 rounded-full select-none cursor-pointer font-mono"
                        >
                          {isRevealed ? "Hide Secrets" : "Reveal Secrets"}
                        </button>
                        <span className="text-[10px] bg-accent/10 text-accent font-semibold px-2 py-0.5 rounded-full select-none uppercase tracking-wider font-mono">
                          Editor Mode
                        </span>
                      </div>
                    </div>
                    <textarea
                      value={bulkEnvText}
                      onChange={(e) => setBulkEnvText(e.target.value)}
                      placeholder="# Example environment variables&#10;GITHUB_TOKEN=••••••••&#10;NOTION_TOKEN=secret_val"
                      rows={12}
                      className="w-full p-3 bg-bg border border-surface-hover/30 rounded-lg
                                 text-text-primary font-mono text-xs placeholder-text-secondary/50 outline-none
                                 focus:border-accent transition-colors resize-y leading-relaxed"
                    />
                    <div className="text-[11px] text-text-secondary space-y-1">
                      <p>• Edit variables in KEY=value format, one per line.</p>
                      <p>• Existing secrets are masked as ••••••••. Keep them as is to leave their values unchanged.</p>
                      <p>• Completely remove a line to delete that environment variable.</p>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => {
                        setIsDevView(false);
                        setIsRevealed(false);
                        setEnvError("");
                      }}
                      className="px-4 py-2 text-xs text-text-secondary hover:text-text-primary font-semibold transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveBulkEnv}
                      disabled={savingEnv}
                      className="px-4 py-2 text-xs bg-accent text-bg font-semibold rounded-lg
                                 hover:opacity-90 disabled:opacity-50 transition-opacity cursor-pointer"
                    >
                      {savingEnv ? "Saving..." : "Save Changes"}
                    </button>
                  </div>
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
          )}

          {activeTab === "integrations" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-text-primary font-semibold text-base">Integrations Hub</h2>
                  <p className="text-text-secondary text-[11px] mt-0.5">
                    Connect infrastructure providers dynamically and customize workflow-specific quick actions.
                  </p>
                </div>
                <button
                  onClick={() => setIsAddingIntegration(true)}
                  className="text-xs bg-accent text-bg font-semibold px-3 py-1.5 rounded-lg hover:opacity-90 transition-opacity flex-shrink-0 cursor-pointer"
                >
                  Add Custom Integration
                </button>
              </div>

              {templatesError && (
                <p className="text-error text-sm p-3 bg-surface rounded-lg">{templatesError}</p>
              )}

              {templatesLoading ? (
                <div className="flex justify-center py-8">
                  <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                </div>
              ) : templates.length === 0 ? (
                <div className="bg-surface rounded-lg p-6 text-center border border-surface-hover/10">
                  <p className="text-text-secondary text-sm">No integrations defined.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {templates.map((integration) => {
                    const isConnected = integration.requiredEnvVars.every((reqVar) =>
                      envVars.some((ev) => ev.key === reqVar && ev.value !== "")
                    );

                    return (
                      <div key={integration.id} className="bg-surface rounded-lg border border-surface-hover/30 overflow-hidden">
                        <div className="p-4 bg-surface-hover/10 border-b border-surface-hover/30 flex items-center justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="text-text-primary text-sm font-semibold">{integration.name}</h3>
                              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                                isConnected ? "bg-success/10 text-success border border-success/20" : "bg-warning/10 text-warning border border-warning/20"
                              }`}>
                                {isConnected ? "Connected" : "Disconnected"}
                              </span>
                            </div>
                            {integration.description && (
                              <p className="text-text-secondary text-[11px] mt-1">{integration.description}</p>
                            )}
                          </div>
                          <button
                            onClick={() => handleDeleteIntegration(integration.id)}
                            className="text-xs text-text-secondary hover:text-error transition-colors px-2 py-1 font-semibold cursor-pointer"
                          >
                            Delete
                          </button>
                        </div>

                        <div className="p-4 space-y-4">
                          <div>
                            <h4 className="text-text-secondary text-xs font-semibold uppercase tracking-wider mb-2">Required Credentials</h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {integration.requiredEnvVars.map((envVar) => {
                                const configured = envVars.some((ev) => ev.key === envVar);
                                return (
                                  <div key={envVar} className="bg-bg/40 rounded-lg p-2 flex items-center justify-between border border-surface-hover/20">
                                    <span className="text-xs font-mono text-text-primary">{envVar}</span>
                                    <button
                                      onClick={() => {
                                        setIsConfiguringEnv({ integrationId: integration.id, envVar });
                                        setConfiguringEnvVal("");
                                      }}
                                      className={`text-[10px] px-2.5 py-1 rounded transition-colors font-semibold cursor-pointer ${
                                        configured ? "bg-surface-hover hover:bg-surface-hover/80 text-text-secondary hover:text-text-primary" : "bg-accent/10 hover:bg-accent/25 text-accent"
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
                              <h4 className="text-text-secondary text-xs font-semibold uppercase tracking-wider">Quick Actions</h4>
                              <button
                                onClick={() => {
                                  setIsAddingAction(integration.id);
                                  setNewActionId("");
                                  setNewActionName("");
                                  setNewActionPrompt("");
                                  setNewActionDesc("");
                                }}
                                className="text-[10px] text-accent hover:underline font-semibold cursor-pointer"
                              >
                                + Add Action
                              </button>
                            </div>
                            {integration.actions.length === 0 ? (
                              <p className="text-text-secondary text-[11px]">No actions defined for this integration.</p>
                            ) : (
                              <div className="space-y-2">
                                {integration.actions.map((action) => (
                                  <div key={action.id} className="bg-bg/40 border border-surface-hover/20 rounded-lg p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                    <div className="min-w-0">
                                      <div className="text-text-primary text-xs font-semibold">{action.name}</div>
                                      {action.description && (
                                        <p className="text-text-secondary text-[10px] mt-0.5">{action.description}</p>
                                      )}
                                      <div className="text-[10px] text-accent font-mono mt-1 truncate bg-bg/50 px-2 py-0.5 rounded border border-surface-hover/10 max-w-lg">
                                        {action.prompt}
                                      </div>
                                    </div>
                                    <button
                                      onClick={() => handleDeleteAction(integration.id, action.id)}
                                      className="text-[10px] text-text-secondary hover:text-error transition-colors px-2 py-1 flex-shrink-0 font-semibold cursor-pointer text-left sm:text-right"
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
            </div>
          )}
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

      {isConfiguringEnv && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-surface rounded-lg w-full max-w-sm p-4 sm:p-6 space-y-4 border border-surface-hover/30">
            <h3 className="text-text-primary font-semibold text-sm">
              Configure {isConfiguringEnv.envVar}
            </h3>
            <input
              type="password"
              value={configuringEnvVal}
              onChange={(e) => setConfiguringEnvVal(e.target.value)}
              placeholder="Enter value"
              autoFocus
              className="w-full px-3 py-2 bg-bg border border-surface-hover rounded-lg
                         text-text-primary placeholder-text-secondary outline-none
                         focus:border-accent transition-colors text-sm"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveConfigEnv();
                if (e.key === "Escape") setIsConfiguringEnv(null);
              }}
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setIsConfiguringEnv(null)}
                className="px-3 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveConfigEnv}
                disabled={savingConfigEnv || !configuringEnvVal.trim()}
                className="px-4 py-2 text-sm bg-accent text-bg font-semibold rounded-lg
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
          <div className="bg-surface rounded-lg w-full max-w-md p-4 sm:p-6 space-y-4 border border-surface-hover/30">
            <h3 className="text-text-primary font-semibold text-sm">Add Custom Integration</h3>
            <div className="space-y-3 text-xs">
              <div>
                <label className="text-text-secondary text-[11px] block mb-1">Integration ID</label>
                <input
                  type="text"
                  value={newIntegrationId}
                  onChange={(e) => setNewIntegrationId(e.target.value)}
                  placeholder="dokploy"
                  className="w-full px-3 py-2 bg-bg border border-surface-hover rounded-lg
                             text-text-primary placeholder-text-secondary outline-none focus:border-accent transition-colors text-sm"
                />
              </div>
              <div>
                <label className="text-text-secondary text-[11px] block mb-1">Name</label>
                <input
                  type="text"
                  value={newIntegrationName}
                  onChange={(e) => setNewIntegrationName(e.target.value)}
                  placeholder="Dokploy"
                  className="w-full px-3 py-2 bg-bg border border-surface-hover rounded-lg
                             text-text-primary placeholder-text-secondary outline-none focus:border-accent transition-colors text-sm"
                />
              </div>
              <div>
                <label className="text-text-secondary text-[11px] block mb-1">Description</label>
                <input
                  type="text"
                  value={newIntegrationDesc}
                  onChange={(e) => setNewIntegrationDesc(e.target.value)}
                  placeholder="Manage self-hosted servers..."
                  className="w-full px-3 py-2 bg-bg border border-surface-hover rounded-lg
                             text-text-primary placeholder-text-secondary outline-none focus:border-accent transition-colors text-sm"
                />
              </div>
              <div>
                <label className="text-text-secondary text-[11px] block mb-1">Required Env Variables (comma-separated)</label>
                <input
                  type="text"
                  value={newIntegrationEnvVars}
                  onChange={(e) => setNewIntegrationEnvVars(e.target.value)}
                  placeholder="DOKPLOY_API_KEY, DOKPLOY_URL"
                  className="w-full px-3 py-2 bg-bg border border-surface-hover rounded-lg
                             text-text-primary placeholder-text-secondary outline-none focus:border-accent transition-colors text-sm font-mono uppercase"
                />
              </div>
              <div>
                <label className="text-text-secondary text-[11px] block mb-1">Required Repo Context Variables (comma-separated)</label>
                <input
                  type="text"
                  value={newIntegrationRepoVars}
                  onChange={(e) => setNewIntegrationRepoVars(e.target.value)}
                  placeholder="dokployAppId"
                  className="w-full px-3 py-2 bg-bg border border-surface-hover rounded-lg
                             text-text-primary placeholder-text-secondary outline-none focus:border-accent transition-colors text-sm font-mono"
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setIsAddingIntegration(false)}
                className="px-3 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateIntegration}
                disabled={!newIntegrationId.trim() || !newIntegrationName.trim()}
                className="px-4 py-2 text-sm bg-accent text-bg font-semibold rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity cursor-pointer"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {isAddingAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-surface rounded-lg w-full max-w-md p-4 sm:p-6 space-y-4 border border-surface-hover/30">
            <h3 className="text-text-primary font-semibold text-sm">Add Quick Action</h3>
            <div className="space-y-3 text-xs">
              <div>
                <label className="text-text-secondary text-[11px] block mb-1">Action ID</label>
                <input
                  type="text"
                  value={newActionId}
                  onChange={(e) => setNewActionId(e.target.value)}
                  placeholder="deploy_prod"
                  className="w-full px-3 py-2 bg-bg border border-surface-hover rounded-lg
                             text-text-primary placeholder-text-secondary outline-none focus:border-accent transition-colors text-sm font-mono"
                />
              </div>
              <div>
                <label className="text-text-secondary text-[11px] block mb-1">Name</label>
                <input
                  type="text"
                  value={newActionName}
                  onChange={(e) => setNewActionName(e.target.value)}
                  placeholder="Deploy to Production"
                  className="w-full px-3 py-2 bg-bg border border-surface-hover rounded-lg
                             text-text-primary placeholder-text-secondary outline-none focus:border-accent transition-colors text-sm"
                />
              </div>
              <div>
                <label className="text-text-secondary text-[11px] block mb-1">Description</label>
                <input
                  type="text"
                  value={newActionDesc}
                  onChange={(e) => setNewActionDesc(e.target.value)}
                  placeholder="Trigger full deployment..."
                  className="w-full px-3 py-2 bg-bg border border-surface-hover rounded-lg
                             text-text-primary placeholder-text-secondary outline-none focus:border-accent transition-colors text-sm"
                />
              </div>
              <div>
                <label className="text-text-secondary text-[11px] block mb-1">Prompt Template</label>
                <textarea
                  value={newActionPrompt}
                  onChange={(e) => setNewActionPrompt(e.target.value)}
                  placeholder="Deploy application using appId: {dokployAppId}."
                  rows={3}
                  className="w-full px-3 py-2 bg-bg border border-surface-hover rounded-lg
                             text-text-primary placeholder-text-secondary outline-none focus:border-accent transition-colors text-sm font-mono"
                />
                <p className="text-[10px] text-text-secondary mt-1">Use braces to enclose repo-specific context variables (e.g. &#123;dokployAppId&#125;).</p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setIsAddingAction(null)}
                className="px-3 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => handleAddAction(isAddingAction)}
                disabled={!newActionId.trim() || !newActionName.trim() || !newActionPrompt.trim()}
                className="px-4 py-2 text-sm bg-accent text-bg font-semibold rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity cursor-pointer"
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
