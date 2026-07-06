import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { MCPCard } from "@/components/mcp/MCPCard";
import { MCPCustomForm } from "@/components/mcp/MCPCustomForm";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { useToast } from "@/contexts/ToastContext";
import { motion, AnimatePresence } from "framer-motion";
import type { McpServerConfig, McpCatalogItem } from "shared";
import { Button } from "@/components/ui/Button";

export function MCPMarketplacePage() {
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState<"gallery" | "custom">("gallery");
  const [catalog, setCatalog] = useState<McpCatalogItem[]>([]);
  const [servers, setServers] = useState<McpServerConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [selectedCategory, setSelectedCategory] = useState<string>("All");

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingServer, setEditingServer] = useState<McpServerConfig | null>(null);

  const [installingId, setInstallingId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [pendingDeleteServerId, setPendingDeleteServerId] = useState<string | null>(null);
  const [deletingServer, setDeletingServer] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [catalogRes, serversRes] = await Promise.all([
        apiFetch("/api/mcp/catalog"),
        apiFetch("/api/mcp/servers"),
      ]);

      if (!catalogRes.ok) throw new Error("Error cargando el catálogo del marketplace");
      if (!serversRes.ok) throw new Error("Error cargando tus servidores configurados");

      const catalogData = await catalogRes.json();
      const serversData = await serversRes.json();

      setCatalog(catalogData.catalog || []);
      setServers(serversData.servers || []);
    } catch (err: any) {
      setError(err.message || "Failed to load MCP Marketplace data");
      addToast("error", err.message || "Fallo al inicializar datos de MCP");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Live status pooling effect when any server is in 'connecting' state
  useEffect(() => {
    const hasConnecting = servers.some((s) => s.status === "connecting");
    if (!hasConnecting) return;

    const interval = setInterval(async () => {
      try {
        const res = await apiFetch("/api/mcp/servers");
        if (res.ok) {
          const data = await res.json();
          setServers(data.servers || []);
        }
      } catch (e) {
        console.error("Failed to pool servers status:", e);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [servers]);

  // Categories list
  const categories = ["All", ...Array.from(new Set(catalog.map((item) => item.category)))];

  // Helper to find installed server configuration by catalog ID
  const getServerConfig = (catalogId: string) => {
    return servers.find((s) => s.id === catalogId);
  };

  // --- ACTIONS ---

  const handleInstallBuiltin = async (catalogId: string) => {
    if (installingId) return; // Prevent double installs
    setInstallingId(catalogId);
    try {
      const res = await apiFetch(`/api/mcp/catalog/${catalogId}/install`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Fallo al instalar el servidor incorporado");
      const data = await res.json();
      
      // Update servers array with the newly installed server
      setServers((prev) => {
        const filtered = prev.filter((s) => s.id !== catalogId);
        return [...filtered, data.server];
      });

      addToast("success", `${data.server.name} instalado con éxito. Iniciando conexión...`);
    } catch (err: any) {
      addToast("error", err.message || "Fallo en la instalación");
    } finally {
      setInstallingId(null);
    }
  };

  const handleToggleEnabled = async (serverId: string, enabled: boolean) => {
    const srv = servers.find((s) => s.id === serverId);
    if (!srv) return;

    // Optimistic UI update
    setServers((prev) =>
      prev.map((s) => (s.id === serverId ? { ...s, enabled } : s))
    );

    try {
      const res = await apiFetch(`/api/mcp/servers/${serverId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...srv, enabled }),
      });
      if (!res.ok) throw new Error("Error al actualizar estado del servidor");
      const data = await res.json();
      
      setServers((prev) =>
        prev.map((s) => (s.id === serverId ? data.server : s))
      );
      addToast("info", `${srv.name} ha sido ${enabled ? "habilitado" : "deshabilitado"}.`);
    } catch (err: any) {
      // Revert optimistic update
      setServers((prev) =>
        prev.map((s) => (s.id === serverId ? { ...s, enabled: !enabled } : s))
      );
      addToast("error", err.message || "Error al actualizar estado");
    }
  };

  const handleConnect = async (serverId: string) => {
    const srv = servers.find((s) => s.id === serverId);
    try {
      const res = await apiFetch(`/api/mcp/servers/${serverId}/connect`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Error al conectar con el servidor");
      const data = await res.json();
      
      setServers((prev) =>
        prev.map((s) => (s.id === serverId ? data.server : s))
      );
      addToast("info", `Conectando con ${srv?.name || serverId}...`);
    } catch (err: any) {
      addToast("error", err.message || "Error de conexión");
    }
  };

  const handleDisconnect = async (serverId: string) => {
    const srv = servers.find((s) => s.id === serverId);
    try {
      const res = await apiFetch(`/api/mcp/servers/${serverId}/disconnect`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Error al desconectar el servidor");
      const data = await res.json();
      
      setServers((prev) =>
        prev.map((s) => (s.id === serverId ? data.server : s))
      );
      addToast("info", `${srv?.name || serverId} desconectado.`);
    } catch (err: any) {
      addToast("error", err.message || "Error al desconectar");
    }
  };

  const executeDeleteServer = async () => {
    if (!pendingDeleteServerId) return;
    setDeletingServer(true);
    try {
      const res = await apiFetch(`/api/mcp/servers/${pendingDeleteServerId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Error al eliminar el servidor");
      
      const srv = servers.find(s => s.id === pendingDeleteServerId);
      if (srv && srv.isBuiltin) {
        setServers((prev) =>
          prev.map((s) => (s.id === pendingDeleteServerId ? { ...s, installed: false, enabled: false, status: "disconnected" } : s))
        );
      } else {
        setServers((prev) => prev.filter((s) => s.id !== pendingDeleteServerId));
      }
      addToast("success", `${srv?.name || pendingDeleteServerId} desinstalado.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      addToast("error", msg || "Error al eliminar servidor");
    } finally {
      setDeletingServer(false);
      setShowDeleteConfirm(false);
      setPendingDeleteServerId(null);
    }
  };

  const handleDeleteServer = (serverId: string) => {
    setPendingDeleteServerId(serverId);
    setShowDeleteConfirm(true);
  };

  const handleTestConnection = async (config: McpServerConfig) => {
    const res = await apiFetch("/api/mcp/servers/test-connection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
    if (!res.ok) throw new Error("Prueba de conexión fallida en el servidor");
    return await res.json();
  };

  const handleTestServer = async (server: McpServerConfig) => {
    if (testingId) return;
    setTestingId(server.id);
    addToast("info", `Validando herramientas de ${server.name}...`);
    try {
      const data = await handleTestConnection(server);
      if (data.success) {
        addToast(
          "success",
          `¡Validación de ${server.name} exitosa! Herramientas descubiertas: ${data.tools.join(", ")}`
        );
        fetchData();
      } else {
        addToast(
          "error",
          `Fallo al validar ${server.name}: ${data.error || "El proceso no respondió."}`
        );
      }
    } catch (err: any) {
      addToast("error", err.message || "Fallo en la prueba de conexión");
    } finally {
      setTestingId(null);
    }
  };

  const handleSaveCustomServer = async (config: McpServerConfig) => {
    try {
      const method = editingServer ? "PUT" : "POST";
      const url = editingServer ? `/api/mcp/servers/${editingServer.id}` : "/api/mcp/servers";
      
      const res = await apiFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });

      if (!res.ok) throw new Error("Error al guardar el servidor personalizado");
      const data = await res.json();

      setServers((prev) => {
        const filtered = prev.filter((s) => s.id !== data.server.id);
        return [...filtered, data.server];
      });

      setIsFormOpen(false);
      setEditingServer(null);

      addToast("success", `Servidor ${data.server.name} guardado.`);

      // Auto-trigger connect for new servers
      try {
        await handleConnect(data.server.id);
      } catch {}
    } catch (err: any) {
      addToast("error", err.message || "Error al guardar servidor personalizado");
    }
  };

  // --- RENDERS ---

  const filteredCatalog = catalog.filter(
    (item) => selectedCategory === "All" || item.category === selectedCategory
  );

  const customServers = servers.filter((s) => !s.isBuiltin);

  return (
    <div className="flex-1 flex flex-col min-h-0 h-full overflow-hidden bg-background text-foreground relative">
      {/* Navigation tabs */}
      <div className="flex items-center justify-between border-b border-border/80 px-6 py-3 flex-shrink-0 bg-card/10">
        <div className="flex items-center gap-1.5 p-0.5 bg-card/60 rounded-xl border border-input/10">
          <button
            onClick={() => {
              setActiveTab("gallery");
              setIsFormOpen(false);
            }}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              activeTab === "gallery"
                ? "bg-card text-primary shadow-sm border border-primary/20"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Galería Oficial
          </button>
          <button
            onClick={() => setActiveTab("custom")}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              activeTab === "custom"
                ? "bg-card text-primary shadow-sm border border-primary/20"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Servidores Custom ({customServers.length})
          </button>
        </div>
        {activeTab === "custom" && !isFormOpen && (
          <Button onClick={() => {
            setEditingServer(null);
            setIsFormOpen(true);
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Agregar Servidor Custom
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-6 min-h-0">
        {error && (
          <div className="mb-6 p-4 bg-destructive/10 border border-destructive/20 text-error rounded-xl text-xs font-mono">
            {error}
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-card/50 border border-input/10 h-48 rounded-xl animate-pulse p-5 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-muted/20" />
                  <div className="space-y-2 flex-1">
                    <div className="h-4 bg-muted/20 w-1/2 rounded" />
                    <div className="h-3 bg-muted/20 w-1/4 rounded" />
                  </div>
                </div>
                <div className="h-16 bg-muted/20 w-full rounded" />
              </div>
            ))}
          </div>
        ) : (
          <AnimatePresence mode="wait">
            {/* Gallery Tab */}
            {activeTab === "gallery" && (
              <motion.div
                key="gallery"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.15 }}
                className="space-y-6"
              >
                {/* Category filters */}
                <div className="flex flex-wrap gap-2">
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all cursor-pointer ${
                        selectedCategory === cat
                          ? "bg-primary/10 border-primary text-primary"
                          : "bg-card/40 border-input/20 text-muted-foreground hover:text-foreground hover:border-input/40"
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredCatalog.map((item) => {
                    const activeConfig = getServerConfig(item.id);
                    const serverConfig: McpServerConfig = activeConfig || {
                      id: item.id,
                      name: item.name,
                      description: item.description,
                      transport: item.isHttp ? "http" : "stdio",
                      command: item.command,
                      args: item.args,
                      env: item.env,
                      url: item.url,
                      installed: false,
                      enabled: false,
                      isBuiltin: true,
                      category: item.category,
                      icon: item.icon,
                      status: "disconnected",
                      tools: [],
                    };

                    const isInstalling = installingId === item.id;
                    const isTesting = testingId === item.id;

                    return (
                      <div key={item.id} className="relative">
                        <MCPCard
                          server={serverConfig}
                          onInstall={() => handleInstallBuiltin(item.id)}
                          onToggleEnabled={(enabled) => handleToggleEnabled(item.id, enabled)}
                          onConnect={() => handleConnect(item.id)}
                          onDisconnect={() => handleDisconnect(item.id)}
                          onDelete={() => handleDeleteServer(item.id)}
                          onTest={() => handleTestServer(serverConfig)}
                        />
                        {isInstalling && (
                          <div className="absolute inset-0 bg-background/60 backdrop-blur-xs flex flex-col items-center justify-center rounded-xl border border-input/25 z-10 space-y-2 animate-fade-in">
                            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                            <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Instalando...</span>
                          </div>
                        )}
                        {isTesting && (
                          <div className="absolute inset-0 bg-background/60 backdrop-blur-xs flex flex-col items-center justify-center rounded-xl border border-input/25 z-10 space-y-2 animate-fade-in">
                            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                            <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Validando...</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {/* Custom Tab */}
            {activeTab === "custom" && (
              <motion.div
                key="custom"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.15 }}
              >
                {isFormOpen ? (
                  <MCPCustomForm
                    initialConfig={editingServer}
                    onCancel={() => {
                      setIsFormOpen(false);
                      setEditingServer(null);
                    }}
                    onTest={handleTestConnection}
                    onSubmit={handleSaveCustomServer}
                  />
                ) : customServers.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 bg-card/25 border border-input/10 rounded-2xl p-6 text-center space-y-4">
                    <div className="w-12 h-12 bg-background border border-input/10 flex items-center justify-center text-2xl rounded-2xl shadow-inner select-none">
                      🔌
                    </div>
                    <div>
                      <h4 className="font-semibold text-sm text-foreground">Sin Servidores Personalizados</h4>
                      <p className="text-muted-foreground text-xs max-w-sm mt-1">
                        Crea integraciones MCP locales ejecutando scripts de node/python, o apunta a microservicios externos compatibles con el protocolo.
                      </p>
                    </div>
                    <Button
                      onClick={() => {
                        setEditingServer(null);
                        setIsFormOpen(true);
                      }}
                    >
                      Agregar Servidor Custom
                    </Button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {customServers.map((srv) => {
                      const isTesting = testingId === srv.id;
                      return (
                        <div key={srv.id} className="relative">
                          <MCPCard
                            server={srv}
                            onToggleEnabled={(enabled) => handleToggleEnabled(srv.id, enabled)}
                            onConnect={() => handleConnect(srv.id)}
                            onDisconnect={() => handleDisconnect(srv.id)}
                            onDelete={() => handleDeleteServer(srv.id)}
                            onEdit={() => {
                              setEditingServer(srv);
                              setIsFormOpen(true);
                            }}
                            onTest={() => handleTestServer(srv)}
                          />
                          {isTesting && (
                            <div className="absolute inset-0 bg-background/60 backdrop-blur-xs flex flex-col items-center justify-center rounded-xl border border-input/25 z-10 space-y-2 animate-fade-in">
                              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                              <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Validando...</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>
      <ConfirmModal
        open={showDeleteConfirm}
        onClose={() => {
          setShowDeleteConfirm(false);
          setPendingDeleteServerId(null);
        }}
        onConfirm={executeDeleteServer}
        title="Uninstall MCP Server"
        message="Are you sure you want to uninstall or delete this MCP server?"
        confirmLabel="Uninstall"
        destructive
        loading={deletingServer}
      />
    </div>
  );
}
