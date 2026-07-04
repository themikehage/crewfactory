import { useState, useEffect, useCallback } from "react";
import { useLiterals } from "@/lib";
import { literals as u } from "./McpTab.literals";

interface McpServerConfig {
  enabled: boolean;
  command: string;
  args: string[];
  env?: Record<string, string>;
}

interface McpConfig {
  mcpServers: Record<string, McpServerConfig>;
}

interface McpTabProps {
  token: string | null;
}

export function McpTab({ token }: McpTabProps) {
const l = useLiterals(u);
  const [mcpConfig, setMcpConfig] = useState<McpConfig | null>(null);
  const [mcpLoading, setMcpLoading] = useState(true);
  const [mcpError, setMcpError] = useState("");
  const [mcpSaving, setMcpSaving] = useState(false);

  const fetchMcpConfig = useCallback(async () => {
    try {
      const res = await fetch("/api/mcp", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load MCP configuration");
      const data = await res.json();
      setMcpConfig(data);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "Failed to load MCP configuration";
      setMcpError(errMsg);
    } finally {
      setMcpLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchMcpConfig();
  }, [fetchMcpConfig]);

  const handleSaveMcpConfig = async (updatedConfig: McpConfig) => {
    setMcpSaving(true);
    setMcpError("");
    try {
      const res = await fetch("/api/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(updatedConfig),
      });
      if (!res.ok) throw new Error("Failed to save MCP configuration");
      const data = await res.json();
      setMcpConfig(data.config);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "Failed to save MCP configuration";
      setMcpError(errMsg);
    } finally {
      setMcpSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-foreground font-semibold text-base">{l.title}</h2>
          <p className="text-muted-foreground text-[11px] mt-0.5">
            Configure and connect dynamic MCP servers. Enabled servers will supply their tools automatically to running agents.
          </p>
        </div>
        {mcpSaving && (
          <span className="text-[10px] text-primary font-semibold flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            Guardando...
          </span>
        )}
      </div>

      {mcpError && (
        <p className="text-destructive text-sm p-3 bg-card rounded-lg">{mcpError}</p>
      )}

      {mcpLoading ? (
        <div className="flex justify-center py-8">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : !mcpConfig || !mcpConfig.mcpServers || Object.keys(mcpConfig.mcpServers).length === 0 ? (
        <div className="bg-card rounded-lg p-6 text-center border border-input/10">
          <p className="text-muted-foreground text-sm">{l.noServers}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(mcpConfig.mcpServers).map(([name, srv]) => (
            <div key={name} className="bg-card rounded-lg border border-input/30 overflow-hidden">
              <div className="p-4 bg-card-hover/10 border-b border-input/30 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="text-foreground text-sm font-semibold capitalize">{name}</h3>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                    srv.enabled ? "bg-primary/10 text-primary border border-success/20" : "bg-text-secondary/10 text-muted-foreground border border-input"
                  }`}>
                    {srv.enabled ? "Enabled" : "Disabled"}
                  </span>
                </div>
                
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={srv.enabled}
                    onChange={(e) => {
                      const updated = {
                        ...mcpConfig,
                        mcpServers: {
                          ...mcpConfig.mcpServers,
                          [name]: { ...srv, enabled: e.target.checked }
                        }
                      };
                      handleSaveMcpConfig(updated);
                    }}
                    className="w-4 h-4 accent-accent rounded border-input bg-background cursor-pointer"
                  />
                  <span className="text-xs text-muted-foreground">{l.active}</span>
                </label>
              </div>

              <div className="p-4 space-y-3 text-xs">
                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <label className="text-[10px] text-muted-foreground block mb-1 font-semibold uppercase tracking-wider">{l.command}</label>
                    <input
                      type="text"
                      value={srv.command}
                      onChange={(e) => {
                        const updated = {
                          ...mcpConfig,
                          mcpServers: {
                            ...mcpConfig.mcpServers,
                            [name]: { ...srv, command: e.target.value }
                          }
                        };
                        setMcpConfig(updated);
                      }}
                      onBlur={() => handleSaveMcpConfig(mcpConfig)}
                      className="w-full px-3 py-1.5 bg-background border border-input rounded-lg text-foreground outline-none focus:border-primary text-xs font-mono"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-muted-foreground block mb-1 font-semibold uppercase tracking-wider">{l.arguments}</label>
                    <input
                      type="text"
                      value={JSON.stringify(srv.args)}
                      onChange={(e) => {
                        try {
                          const parsedArgs = JSON.parse(e.target.value);
                          if (Array.isArray(parsedArgs)) {
                            const updated = {
                              ...mcpConfig,
                              mcpServers: {
                                ...mcpConfig.mcpServers,
                                [name]: { ...srv, args: parsedArgs }
                              }
                            };
                            setMcpConfig(updated);
                          }
                        } catch {
                          // Ignore partial typing JSON parsing errors
                        }
                      }}
                      onBlur={() => handleSaveMcpConfig(mcpConfig)}
                      className="w-full px-3 py-1.5 bg-background border border-input rounded-lg text-foreground outline-none focus:border-primary text-xs font-mono"
                    />
                  </div>

                  {srv.env && Object.entries(srv.env).map(([envKey, envVal]) => (
                    <div key={envKey}>
                      <label className="text-[10px] text-muted-foreground block mb-1 font-semibold uppercase tracking-wider">{envKey}</label>
                      <input
                        type="password"
                        value={envVal}
                        onChange={(e) => {
                          const updated = {
                            ...mcpConfig,
                            mcpServers: {
                              ...mcpConfig.mcpServers,
                              [name]: {
                                ...srv,
                                env: { ...srv.env, [envKey]: e.target.value }
                              }
                            }
                          };
                          setMcpConfig(updated);
                        }}
                        onBlur={() => handleSaveMcpConfig(mcpConfig)}
                        placeholder={l.enterValue}
                        className="w-full px-3 py-1.5 bg-background border border-input rounded-lg text-foreground outline-none focus:border-primary text-xs"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
