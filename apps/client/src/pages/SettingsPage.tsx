import { useState, useEffect, useCallback } from "react";
import { GeneralTab } from "@/components/settings/GeneralTab";
import { ProvidersTab } from "@/components/settings/ProvidersTab";
import { EnvVarsTab } from "@/components/settings/EnvVarsTab";
import { IntegrationsTab } from "@/components/settings/IntegrationsTab";
import { McpTab } from "@/components/settings/McpTab";

interface EnvVar {
  key: string;
  value: string;
}

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState<"general" | "providers" | "env" | "integrations" | "mcp">("providers");
  const [envVars, setEnvVars] = useState<EnvVar[]>([]);
  const [envLoading, setEnvLoading] = useState(true);
  const [envError, setEnvError] = useState("");

  const token = localStorage.getItem("token");

  const fetchEnvVars = useCallback(async () => {
    try {
      const res = await fetch("/api/env", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load environment variables");
      const data = await res.json();
      setEnvVars(data.env ?? []);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "Error loading environment variables";
      setEnvError(errMsg);
    } finally {
      setEnvLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchEnvVars();
  }, [fetchEnvVars]);

  const tabs = [
    { id: "providers", label: "LLM Providers" },
    { id: "env", label: "Env Variables" },
    { id: "integrations", label: "Integrations Hub" },
    { id: "mcp", label: "MCP Servers" },
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
            <GeneralTab token={token} />
          )}

          {activeTab === "providers" && (
            <ProvidersTab token={token} />
          )}

          {activeTab === "env" && (
            <EnvVarsTab
              token={token}
              envVars={envVars}
              envLoading={envLoading}
              envError={envError}
              setEnvError={setEnvError}
              fetchEnvVars={fetchEnvVars}
            />
          )}

          {activeTab === "integrations" && (
            <IntegrationsTab
              token={token}
              envVars={envVars}
              fetchEnvVars={fetchEnvVars}
            />
          )}

          {activeTab === "mcp" && (
            <McpTab token={token} />
          )}
        </div>
      </div>
    </div>
  );
}
