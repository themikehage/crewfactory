import { apiFetch } from "@/lib/api";
import { useState, useEffect, useCallback } from "react";
import { useLiterals } from "@/lib";
import { literals as u } from "./SettingsPage.literals";
import { GeneralTab } from "@/components/settings/GeneralTab";
import { ProvidersTab } from "@/components/settings/ProvidersTab";
import { EnvVarsTab } from "@/components/settings/EnvVarsTab";
import { IntegrationsTab } from "@/components/settings/IntegrationsTab";
import { MCPMarketplacePage } from "@/pages/MCPMarketplacePage";

interface EnvVar {
  key: string;
  value: string;
}

export function SettingsPage() {
  const l = useLiterals(u);
  const [activeTab, setActiveTab] = useState<"general" | "providers" | "env" | "integrations" | "mcp">(() => {
    return (localStorage.getItem("settings-active-tab") as any) || "general";
  });
  const [envVars, setEnvVars] = useState<EnvVar[]>([]);
  const [envLoading, setEnvLoading] = useState(true);
  const [envError, setEnvError] = useState("");

  const fetchEnvVars = useCallback(async () => {
    try {
      const res = await apiFetch("/api/env");
      if (!res.ok) throw new Error("Failed to load environment variables");
      const data = await res.json();
      setEnvVars(data.env ?? []);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "Error loading environment variables";
      setEnvError(errMsg);
    } finally {
      setEnvLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEnvVars();
  }, [fetchEnvVars]);

  const handleTabChange = (tabId: "general" | "providers" | "env" | "integrations" | "mcp") => {
    setActiveTab(tabId);
    localStorage.setItem("settings-active-tab", tabId);
  };

  const tabs = [
    { id: "general", label: l.tabGeneral },
    { id: "integrations", label: l.tabIntegrations },
    { id: "providers", label: l.tabProviders },
    { id: "env", label: l.tabEnv },
    { id: "mcp", label: l.tabMcp || "MCP Servers" },
  ] as const;

  return (
    <div className="h-full flex flex-col bg-background">
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Tab selector */}
        <div className="max-w-2xl w-full mx-auto px-3 sm:px-6 pt-3 sm:pt-6 flex-shrink-0">
          <div className="flex border-b border-input/30 mb-6 gap-2 pb-1.5 w-full overflow-x-auto scrollbar-none flex-nowrap">
            {tabs.map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  className={`flex-none px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-all whitespace-nowrap cursor-pointer ${
                    active
                      ? "text-primary bg-primary/10 border border-primary/25"
                      : "text-muted-foreground hover:text-foreground hover:bg-card-hover/20 border border-transparent"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {activeTab === "mcp" ? (
            <MCPMarketplacePage />
          ) : (
            <div className="max-w-2xl mx-auto px-3 sm:px-6 pb-6 space-y-6">
              {activeTab === "general" && <GeneralTab />}
              {activeTab === "providers" && <ProvidersTab />}
              {activeTab === "env" && (
                <EnvVarsTab
                  envVars={envVars}
                  envLoading={envLoading}
                  envError={envError}
                  setEnvError={setEnvError}
                  fetchEnvVars={fetchEnvVars}
                />
              )}
              {activeTab === "integrations" && (
                <IntegrationsTab envVars={envVars} fetchEnvVars={fetchEnvVars} />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
