import { useState, useEffect, useRef, useMemo } from "react";
import type { GlobalLogEvent } from "shared";

export function LogsConsolePage() {
  const [logs, setLogs] = useState<GlobalLogEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [wsConnected, setWsConnected] = useState(false);
  const [pauseScroll, setPauseScroll] = useState(false);

  // Filtros
  const [filterSource, setFilterSource] = useState<"all" | "session" | "channel">("all");
  const [showMessages, setShowMessages] = useState(true);
  const [showThinking, setShowThinking] = useState(true);
  const [showTools, setShowTools] = useState(true);

  const consoleEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Carga histórica inicial
  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const token = localStorage.getItem("token");
        const res = await fetch("/api/logs", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setLogs(data.logs || []);
        }
      } catch (err) {
        console.error("Failed to load logs history:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, []);

  // Conexión en tiempo real por WebSocket
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;

    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${location.host}/ws`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setWsConnected(true);
      ws.send(JSON.stringify({ type: "auth", token }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "global_log" && data.event) {
          setLogs((prev) => {
            const next = [...prev, data.event];
            // Límite local para no saturar memoria en el cliente
            if (next.length > 500) next.shift();
            return next;
          });
        }
      } catch {}
    };

    ws.onclose = () => {
      setWsConnected(false);
    };

    return () => {
      ws.close();
    };
  }, []);

  // Auto-scroll al final del log
  useEffect(() => {
    if (!pauseScroll && consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, pauseScroll]);

  // Filtrado de logs
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      // Filtrar por origen
      if (filterSource !== "all" && log.sourceType !== filterSource) {
        return false;
      }
      // Filtrar por tipo de evento
      if (log.eventType === "user_message" || log.eventType === "agent_message") {
        return showMessages;
      }
      if (log.eventType === "thinking_delta") {
        return showThinking;
      }
      if (log.eventType === "tool_start" || log.eventType === "tool_end") {
        return showTools;
      }
      return true;
    });
  }, [logs, filterSource, showMessages, showThinking, showTools]);

  const handleClearLogs = () => {
    setLogs([]);
  };

  // Formateador de timestamps
  const formatTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    } catch {
      return "--:--:--";
    }
  };

  // Renderizar la fila de logs
  const renderLogLine = (log: GlobalLogEvent, idx: number) => {
    const sourceColor = log.sourceType === "channel" ? "text-purple-400" : "text-blue-400";
    const sourceLabel = log.sourceType === "channel" ? "Canal" : "Sesión";

    return (
      <div key={idx} className="hover:bg-surface-hover/20 px-2 py-1 border-b border-surface-hover/10 leading-relaxed">
        <div className="flex flex-wrap items-baseline gap-1.5">
          {/* Timestamp */}
          <span className="text-text-secondary/40 select-none shrink-0">
            [{formatTime(log.timestamp)}]
          </span>

          {/* Source Type / Name */}
          <span className={`text-[10px] font-bold ${sourceColor} shrink-0 select-none`}>
            [{sourceLabel}: {log.sourceName || log.sourceId.substring(0, 8)}]
          </span>

          {/* Agent Badge if present */}
          {log.agentName && (
            <span className="text-[10px] bg-purple-400/10 text-purple-400 border border-purple-400/20 px-1 py-0.2 rounded font-semibold shrink-0 select-none">
              {log.agentName}
            </span>
          )}

          {/* Event Content */}
          <div className="flex-1 min-w-0">
            {log.eventType === "user_message" && (
              <span className="text-text-primary">
                👤 <span className="font-semibold text-text-secondary">Usuario:</span> "{log.detail}"
              </span>
            )}

            {log.eventType === "agent_message" && (
              <span className="text-text-primary">
                🤖 <span className="font-semibold text-purple-400">Respuesta:</span> "{log.detail}"
              </span>
            )}

            {log.eventType === "agent_start" && (
              <span className="text-accent/80 italic font-sans select-none">
                🎬 Iniciando respuesta...
              </span>
            )}

            {log.eventType === "agent_end" && (
              <span className="text-text-secondary/50 italic font-sans select-none">
                ⏹️ Finalizó respuesta.
              </span>
            )}

            {log.eventType === "text_delta" && (
              <span className="text-text-secondary/80 font-sans italic truncate block">
                ✍️ Escribiendo: <span className="font-mono not-italic text-text-primary">"{log.detail}"</span>
              </span>
            )}

            {log.eventType === "thinking_delta" && (
              <span className="text-accent/40 font-sans italic truncate block">
                🧠 Razonando: <span className="font-mono not-italic text-accent/60">"{log.detail}"</span>
              </span>
            )}

            {log.eventType === "tool_start" && (
              <span className="text-warning/80">
                🛠️ <span className="font-bold font-mono">Tool Start:</span> <span className="text-warning">{log.detail.toolName}</span> (args: <span className="text-text-secondary/70 font-mono">{JSON.stringify(log.detail.args)}</span>)
              </span>
            )}

            {log.eventType === "tool_end" && (
              <span className={log.detail.isError ? "text-error/80" : "text-accent/80"}>
                {log.detail.isError ? "❌" : "✓"} <span className="font-bold font-mono">Tool End:</span> <span className={log.detail.isError ? "text-error" : "text-accent"}>{log.detail.toolName}</span> ({log.detail.isError ? "error" : "success"})
                {!log.detail.isError && log.detail.result && (
                  <span className="text-text-secondary/60 text-[10px] ml-2 block font-sans">
                    Resultado: {typeof log.detail.result === "string" ? log.detail.result.slice(0, 100) : JSON.stringify(log.detail.result).slice(0, 100)}...
                  </span>
                )}
                {log.detail.isError && log.detail.result && (
                  <span className="text-error/70 text-[10px] ml-2 block font-sans whitespace-pre-wrap">
                    Error: {String(log.detail.result)}
                  </span>
                )}
              </span>
            )}

            {log.eventType === "error" && (
              <span className="text-error font-semibold">
                ⚠️ Error: {log.detail}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-bg overflow-hidden p-4 sm:p-6 font-sans">
      {/* Barra de Controles superiores */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 bg-surface border border-surface-hover rounded-xl mb-4 flex-shrink-0 text-xs text-text-secondary">
        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-text-primary">Origen:</span>
            <select
              value={filterSource}
              onChange={(e) => setFilterSource(e.target.value as any)}
              className="bg-bg border border-surface-hover rounded px-2.5 py-1 text-text-primary outline-none focus:border-accent cursor-pointer"
            >
              <option value="all">Todos</option>
              <option value="session">Sesiones</option>
              <option value="channel">Canales</option>
            </select>
          </div>

          <div className="flex items-center gap-3 border-l border-surface-hover pl-4 select-none">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={showMessages}
                onChange={(e) => setShowMessages(e.target.checked)}
                className="w-3.5 h-3.5 accent-accent"
              />
              <span>Mensajes</span>
            </label>

            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={showThinking}
                onChange={(e) => setShowThinking(e.target.checked)}
                className="w-3.5 h-3.5 accent-accent"
              />
              <span>Razonamiento</span>
            </label>

            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={showTools}
                onChange={(e) => setShowTools(e.target.checked)}
                className="w-3.5 h-3.5 accent-accent"
              />
              <span>Herramientas</span>
            </label>
          </div>
        </div>

        {/* Acciones y Conexión */}
        <div className="flex items-center gap-3 ml-auto">
          {/* Conexión */}
          <div className="flex items-center gap-1.5 select-none">
            <span className={`w-2 h-2 rounded-full ${wsConnected ? "bg-success animate-pulse" : "bg-error"}`} />
            <span className="text-[10px] font-mono">{wsConnected ? "ws-connected" : "ws-disconnected"}</span>
          </div>

          {/* Congelar Scroll */}
          <button
            onClick={() => setPauseScroll(!pauseScroll)}
            className={`px-3 py-1.5 rounded-lg border font-semibold transition-colors cursor-pointer ${
              pauseScroll
                ? "border-accent/40 bg-accent/15 text-accent"
                : "border-surface-hover hover:bg-surface-hover text-text-secondary hover:text-text-primary"
            }`}
          >
            {pauseScroll ? "Reanudar Autoscroll" : "Congelar Scroll"}
          </button>

          {/* Limpiar */}
          <button
            onClick={handleClearLogs}
            className="px-3 py-1.5 rounded-lg border border-surface-hover hover:bg-surface-hover text-text-secondary hover:text-text-primary transition-colors cursor-pointer font-semibold"
          >
            Limpiar Pantalla
          </button>
        </div>
      </div>

      {/* Pantalla del terminal */}
      <div className="flex-1 bg-surface border border-surface-hover rounded-xl shadow-2xl overflow-hidden flex flex-col min-h-0 relative">
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center space-y-2 text-text-secondary/55">
            <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            <span className="text-xs">Cargando consola...</span>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-text-secondary/40 text-xs font-mono select-none">
            &gt;_ Esperando eventos de logs del sistema...
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4 font-mono text-[11px] text-text-primary space-y-0.5 selection:bg-accent/30 selection:text-text-primary">
            {filteredLogs.map((log, idx) => renderLogLine(log, idx))}
            <div ref={consoleEndRef} />
          </div>
        )}
      </div>
    </div>
  );
}
