import { useState } from "react";
import type { McpServerConfig } from "shared";

interface MCPCardProps {
  server: McpServerConfig;
  onInstall?: () => void;
  onToggleEnabled?: (enabled: boolean) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onDelete?: () => void;
  onEdit?: () => void;
  onTest?: () => void;
}

export function MCPCard({
  server,
  onInstall,
  onToggleEnabled,
  onConnect,
  onDisconnect,
  onDelete,
  onEdit,
  onTest,
}: MCPCardProps) {
  const [expanded, setExpanded] = useState(false);

  const getStatusBadge = () => {
    switch (server.status) {
      case "connected":
        return (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-success/10 text-accent border border-success/20">
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            Conectado
          </span>
        );
      case "connecting":
        return (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-warning/10 text-warning border border-warning/20">
            <span className="w-1.5 h-1.5 rounded-full bg-warning animate-pulse" />
            Conectando...
          </span>
        );
      case "error":
        return (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-destructive/10 text-error border border-destructive/20">
            <span className="w-1.5 h-1.5 rounded-full bg-error" />
            Error
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-muted/20 text-muted-foreground border border-input/20">
            <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60" />
            Desconectado
          </span>
        );
    }
  };

  return (
    <div className="bg-card hover:bg-card-hover/20 transition-all rounded-xl border border-input/20 overflow-hidden flex flex-col justify-between">
      {/* Header Info */}
      <div className="p-5 space-y-3 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-background border border-input/10 flex items-center justify-center text-xl shadow-inner select-none">
              {server.icon || "🔌"}
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground tracking-tight flex items-center gap-2">
                {server.name}
              </h3>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {server.category || "General"}
              </span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            {server.installed && getStatusBadge()}
            {server.isBuiltin && (
              <span className="text-[9px] px-1.5 py-0.2 bg-primary/10 text-primary rounded font-mono border border-primary/20">
                Built-in
              </span>
            )}
          </div>
        </div>

        <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed">
          {server.description || "Sin descripción disponible."}
        </p>

        {/* Configuration Summary */}
        <div className="pt-2 text-[10px] font-mono text-muted-foreground/80 space-y-1 bg-background/50 p-2.5 rounded-lg border border-input/5">
          {server.transport === "http" ? (
            <div className="truncate">
              <span className="text-primary/70 font-semibold">URL:</span> {server.url}
            </div>
          ) : (
            <>
              <div className="truncate">
                <span className="text-primary/70 font-semibold">Cmd:</span> {server.command}
              </div>
              <div className="truncate">
                <span className="text-primary/70 font-semibold">Args:</span> {JSON.stringify(server.args)}
              </div>
            </>
          )}
        </div>

        {/* Expandable Tools Section */}
        {server.installed && server.status === "connected" && server.tools && server.tools.length > 0 && (
          <div className="pt-1 border-t border-input/10">
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center justify-between w-full text-left text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              <span>Herramientas descubiertas ({server.tools.length})</span>
              <svg
                width="12"
                height="12"
                viewBox="0 0 20 20"
                fill="currentColor"
                className={`transform transition-transform ${expanded ? "rotate-180" : ""}`}
              >
                <path
                  fillRule="evenodd"
                  d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
            {expanded && (
              <div className="mt-2 max-h-36 overflow-y-auto space-y-1 p-2 bg-background/80 rounded-lg border border-input/10 font-mono text-[9px] text-muted-foreground">
                {server.tools.map((t) => (
                  <div key={t} className="flex items-center gap-1.5 py-0.5 truncate hover:text-foreground">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent/40" />
                    <span>{t}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {server.installed && server.status === "error" && server.error && (
          <div className="p-2.5 bg-destructive/5 border border-destructive/20 rounded-lg text-[10px] text-error font-mono overflow-x-auto max-h-24 leading-normal">
            <span className="font-bold uppercase tracking-wider block mb-1">Detalle del error:</span>
            {server.error}
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="p-4 bg-background/30 border-t border-input/10 flex items-center justify-between gap-2.5">
        {!server.installed ? (
          <button
            onClick={onInstall}
            className="w-full py-1.5 px-3 bg-primary hover:bg-primary/95 text-primary-foreground font-semibold rounded-lg text-xs transition-colors cursor-pointer text-center"
          >
            Instalar
          </button>
        ) : (
          <>
            {/* Toggle Enable State */}
            <div className="flex items-center gap-2 select-none">
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={server.enabled}
                  onChange={(e) => onToggleEnabled && onToggleEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-7 h-4 bg-muted/40 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-accent" />
              </label>
              <span className="text-[11px] font-medium text-muted-foreground">Activo</span>
            </div>

            {/* Connection and Custom management buttons */}
            <div className="flex items-center gap-1.5">
              {server.enabled && (
                <>
                  {onTest && (
                    <button
                      onClick={onTest}
                      className="px-2.5 py-1 bg-primary/10 hover:bg-primary/20 text-primary font-semibold rounded-md text-[10px] border border-primary/20 transition-colors cursor-pointer"
                      title="Validar herramientas en caliente (ping JSON-RPC)"
                    >
                      Validar
                    </button>
                  )}
                  {server.status === "connected" ? (
                    <button
                      onClick={onDisconnect}
                      className="px-2.5 py-1 bg-muted/20 hover:bg-muted/30 text-muted-foreground font-medium rounded-md text-[10px] transition-colors cursor-pointer"
                      title="Desconectar"
                    >
                      Desconectar
                    </button>
                  ) : (
                    <button
                      onClick={onConnect}
                      className="px-2.5 py-1 bg-accent/10 hover:bg-accent/25 text-accent font-semibold rounded-md text-[10px] border border-success/20 transition-colors cursor-pointer"
                      title="Conectar"
                    >
                      Conectar
                    </button>
                  )}
                </>
              )}

              {onEdit && (
                <button
                  onClick={onEdit}
                  className="p-1 hover:bg-card-hover/20 text-muted-foreground hover:text-foreground rounded transition-colors cursor-pointer"
                  title="Editar configuración"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4Z" />
                  </svg>
                </button>
              )}

              {!server.isBuiltin && onDelete && (
                <button
                  onClick={onDelete}
                  className="p-1 hover:bg-card-hover/20 text-muted-foreground hover:text-error rounded transition-colors cursor-pointer"
                  title="Eliminar servidor"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
