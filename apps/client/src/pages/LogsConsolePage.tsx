import { useState, useEffect, useRef, useMemo } from "react";
import { useSessionStatusWs } from "@/hooks/useSessionStatusWs";
import type { GlobalLogEvent } from "shared";

interface SessionItem {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  status?: string;
  repoName?: string;
  agentId?: string;
  channelId?: string;
}

interface LogsConsolePageProps {
  onSelectRepo: (repoId: string | null, repoName: string | null) => void;
  onSelectAgent: (agent: { id: string; name: string } | null) => void;
  onSelectChannel: (channel: { id: string; name: string } | null) => void;
  onNavigate: (path: string) => void;
}

// Agrupador de deltas de tokens para la consola de logs
function groupConsecutiveDeltas(events: GlobalLogEvent[]): GlobalLogEvent[] {
  const result: GlobalLogEvent[] = [];
  for (const ev of events) {
    if (result.length > 0) {
      const last = result[result.length - 1];
      if (
        last.sourceId === ev.sourceId &&
        last.sourceType === ev.sourceType &&
        last.eventType === ev.eventType &&
        (ev.eventType === "text_delta" || ev.eventType === "thinking_delta")
      ) {
        last.detail = (last.detail || "") + (ev.detail || "");
        last.timestamp = ev.timestamp;
        continue;
      }
    }
    result.push({ ...ev });
  }
  return result;
}

export function LogsConsolePage({
  onSelectRepo,
  onSelectAgent,
  onSelectChannel,
  onNavigate,
}: LogsConsolePageProps) {
  const [activeTab, setActiveTab] = useState<"sessions" | "logs">("sessions");
  
  // Estados para pestaña de Sesiones
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [channels, setChannels] = useState<{ id: string; name: string }[]>([]);
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);
  
  // Estados para pestaña de Logs
  const [logs, setLogs] = useState<GlobalLogEvent[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [wsConnected, setWsConnected] = useState(false);
  const [pauseScroll, setPauseScroll] = useState(false);

  // Filtros de Logs
  const [filterSource, setFilterSource] = useState<"all" | "session" | "channel">("all");
  const [showMessages, setShowMessages] = useState(true);
  const [showThinking, setShowThinking] = useState(true);
  const [showTools, setShowTools] = useState(true);

  const consoleEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Hook global de WebSocket para recibir estados reactivos en tiempo real
  const liveSessionStatuses = useSessionStatusWs();

  // Diccionarios de lookup rápidos para nombres
  const channelNamesMap = useMemo(() => {
    return new Map(channels.map((c) => [c.id, c.name]));
  }, [channels]);

  const agentNamesMap = useMemo(() => {
    return new Map(agents.map((a) => [a.id, a.name]));
  }, [agents]);

  // Carga de inicialización para la pestaña de Sesiones
  const fetchSessionsData = async () => {
    try {
      setSessionsLoading(true);
      const token = localStorage.getItem("token");

      // Cargar sesiones, canales y agentes en paralelo
      const [resSessions, resChannels, resAgents] = await Promise.all([
        fetch("/api/sessions", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/channels", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/agents", { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      if (resSessions.ok) {
        const data = await resSessions.json();
        setSessions(data.sessions || []);
      }
      if (resChannels.ok) {
        const data = await resChannels.json();
        setChannels(data.channels || []);
      }
      if (resAgents.ok) {
        const data = await resAgents.json();
        setAgents(data.agents || []);
      }
    } catch (err) {
      console.error("Failed to load sessions data:", err);
    } finally {
      setSessionsLoading(false);
    }
  };

  useEffect(() => {
    fetchSessionsData();
  }, []);

  // Carga histórica inicial de logs
  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const token = localStorage.getItem("token");
        const res = await fetch("/api/logs", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setLogs(groupConsecutiveDeltas(data.logs || []));
        }
      } catch (err) {
        console.error("Failed to load logs history:", err);
      } finally {
        setLogsLoading(false);
      }
    };

    fetchHistory();
  }, []);

  // Conexión en tiempo real por WebSocket para la pestaña de Logs
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
            if (next.length > 500) next.shift();
            return groupConsecutiveDeltas(next);
          });

          // Si el evento indica actividad en una sesión, recargar la lista de sesiones
          // para mantener los updatedAt al día (y su ordenación correcta en la grilla)
          if (
            data.event.eventType === "agent_start" ||
            data.event.eventType === "agent_end" ||
            data.event.eventType === "tool_end" ||
            data.event.eventType === "user_message"
          ) {
            // Actualizar localmente la sesión modificada en la grilla de forma optimista
            setSessions((prevSessions) => {
              return prevSessions.map((s) => {
                if (s.id === data.event.sourceId) {
                  return { ...s, updatedAt: new Date().toISOString() };
                }
                return s;
              });
            });
          }
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
    if (activeTab === "logs" && !pauseScroll && consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, pauseScroll, activeTab]);

  // Mezclar estados reactivos de WebSocket con la lista cargada por HTTP
  const displaySessions = useMemo(() => {
    const merged = sessions.map((s) => {
      const liveStatus = liveSessionStatuses[s.id];
      return {
        ...s,
        status: liveStatus || s.status || "sleeping",
      };
    });

    // Ordenar por updatedAt desc (las de actividad más reciente primero)
    return merged.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [sessions, liveSessionStatuses]);

  // Filtrado de logs para la consola
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (filterSource !== "all" && log.sourceType !== filterSource) {
        return false;
      }
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

  const handleOpenSession = (s: SessionItem) => {
    // 1. Establecer el contexto
    if (s.repoName) {
      onSelectRepo(s.repoName, s.repoName);
    } else if (s.channelId) {
      const name = channelNamesMap.get(s.channelId) || s.channelId;
      onSelectChannel({ id: s.channelId, name });
    } else if (s.agentId) {
      const name = agentNamesMap.get(s.agentId) || s.agentId;
      onSelectAgent({ id: s.agentId, name });
    } else {
      onSelectRepo(null, null);
      onSelectAgent(null);
      onSelectChannel(null);
    }
    // 2. Redirigir
    onNavigate(`/session/${s.id}`);
  };

  const formatRelativeTime = (updatedAt: string, status?: string) => {
    if (status === "streaming" || status === "task-running") return "Activa ahora";
    try {
      const past = new Date(updatedAt).getTime();
      const now = Date.now();
      const diffMs = now - past;
      const diffSec = Math.floor(diffMs / 1000);
      const diffMin = Math.floor(diffSec / 60);
      const diffHour = Math.floor(diffMin / 60);

      if (diffSec < 30) return "Hace unos instantes";
      if (diffSec < 60) return `Hace ${diffSec} segundos`;
      if (diffMin < 60) return `Hace ${diffMin} ${diffMin === 1 ? "minuto" : "minutos"}`;
      if (diffHour < 24) return `Hace ${diffHour} ${diffHour === 1 ? "hora" : "horas"}`;
      return new Date(updatedAt).toLocaleDateString();
    } catch {
      return "Sin actividad registrada";
    }
  };

  const renderLogLine = (log: GlobalLogEvent, idx: number) => {
    const sourceColor = log.sourceType === "channel" ? "text-purple-400" : "text-blue-400";
    const sourceLabel = log.sourceType === "channel" ? "Canal" : "Sesión";

    return (
      <div key={idx} className="hover:bg-surface-hover/20 px-2 py-1 border-b border-surface-hover/10 leading-relaxed">
        <div className="flex flex-wrap items-baseline gap-1.5">
          <span className="text-text-secondary/40 select-none shrink-0">
            [{new Date(log.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}]
          </span>

          <span className={`text-[10px] font-bold ${sourceColor} shrink-0 select-none`}>
            [{sourceLabel}: {log.sourceName || log.sourceId.substring(0, 8)}]
          </span>

          {log.agentName && (
            <span className="text-[10px] bg-purple-400/10 text-purple-400 border border-purple-400/20 px-1 py-0.2 rounded font-semibold shrink-0 select-none">
              {log.agentName}
            </span>
          )}

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
              <span className="text-text-primary block font-mono whitespace-pre-wrap mt-0.5 bg-surface/30 p-1.5 rounded border border-surface-hover/10 leading-relaxed">
                ✍️ <span className="font-semibold text-text-secondary">Escribiendo:</span> {log.detail}
              </span>
            )}

            {log.eventType === "thinking_delta" && (
              <span className="text-accent/60 block font-mono whitespace-pre-wrap mt-0.5 bg-accent/5 p-1.5 rounded border border-accent/10 leading-relaxed">
                🧠 <span className="font-semibold text-accent/80">Pensando:</span> {log.detail}
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
                    Resultado: {typeof log.detail.result === "string" ? log.detail.result.slice(0, 150) : JSON.stringify(log.detail.result).slice(0, 150)}...
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
      {/* Selector de Pestañas */}
      <div className="flex border-b border-surface-hover mb-4 flex-shrink-0">
        <button
          onClick={() => setActiveTab("sessions")}
          className={`px-4 py-2 text-xs font-semibold cursor-pointer border-b-2 transition-all ${
            activeTab === "sessions"
              ? "border-accent text-accent"
              : "border-transparent text-text-secondary hover:text-text-primary"
          }`}
        >
          Sesiones en Streaming
        </button>
        <button
          onClick={() => setActiveTab("logs")}
          className={`px-4 py-2 text-xs font-semibold cursor-pointer border-b-2 transition-all ${
            activeTab === "logs"
              ? "border-accent text-accent"
              : "border-transparent text-text-secondary hover:text-text-primary"
          }`}
        >
          Trazas de Sistema
        </button>
      </div>

      {activeTab === "sessions" ? (
        /* VISTA A: GRILLA DE SESIONES */
        <div className="flex-1 overflow-y-auto min-h-0">
          {sessionsLoading ? (
            <div className="flex flex-col items-center justify-center py-20 space-y-2 text-text-secondary/55">
              <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              <span className="text-xs">Cargando sesiones...</span>
            </div>
          ) : displaySessions.length === 0 ? (
            <div className="text-center text-text-secondary/40 text-xs py-20">
              No hay sesiones activas en este momento.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {displaySessions.map((session) => {
                // Resolver el tipo y color del badge del contexto de la sesión
                let badgeText = "Global";
                let badgeColor = "bg-text-secondary/10 text-text-secondary border-text-secondary/20";
                
                if (session.repoName) {
                  badgeText = `Proyecto: ${session.repoName}`;
                  badgeColor = "bg-blue-400/10 text-blue-400 border-blue-400/20";
                } else if (session.channelId) {
                  const chName = channelNamesMap.get(session.channelId) || session.channelId;
                  badgeText = `Canal: #${chName}`;
                  badgeColor = "bg-purple-400/10 text-purple-400 border-purple-400/20";
                } else if (session.agentId) {
                  const agName = agentNamesMap.get(session.agentId) || session.agentId;
                  badgeText = `Agente: ${agName}`;
                  badgeColor = "bg-amber-400/10 text-amber-400 border-amber-400/20";
                }

                // Colores del indicador de estado
                let statusDotColor = "bg-text-secondary/40";
                let statusLabel = "Inactiva";
                if (session.status === "streaming") {
                  statusDotColor = "bg-warning animate-pulse";
                  statusLabel = "Streaming...";
                } else if (session.status === "task-running") {
                  statusDotColor = "bg-accent animate-pulse";
                  statusLabel = "Task Running...";
                } else if (session.status === "active") {
                  statusDotColor = "bg-success";
                  statusLabel = "Activa";
                }

                return (
                  <div
                    key={session.id}
                    className="bg-surface border border-surface-hover/60 rounded-xl p-4 flex flex-col justify-between hover:border-accent/30 transition-all shadow-md gap-3"
                  >
                    <div>
                      {/* Cabecera de la tarjeta: Título y Dot de Estado */}
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <h3 className="font-semibold text-text-primary text-sm truncate flex-1 leading-snug">
                          {session.name}
                        </h3>
                        <span className="flex items-center gap-1 text-[10px] font-semibold text-text-secondary shrink-0 select-none">
                          <span className={`w-1.5 h-1.5 rounded-full ${statusDotColor}`} />
                          {statusLabel}
                        </span>
                      </div>

                      {/* Badge de Contexto */}
                      <div className="flex flex-wrap gap-2 items-center mb-1 select-none">
                        <span className={`text-[9px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-md border ${badgeColor}`}>
                          {badgeText}
                        </span>
                      </div>
                    </div>

                    <div className="border-t border-surface-hover/30 pt-3 flex items-center justify-between mt-1 text-[10px] text-text-secondary select-none">
                      {/* Última actividad / Tiempo relativo */}
                      <div className="flex flex-col">
                        <span className="text-text-secondary/40 uppercase tracking-widest text-[8px] font-bold">Actividad</span>
                        <span className="font-medium text-text-secondary/80">
                          {formatRelativeTime(session.updatedAt, session.status)}
                        </span>
                      </div>

                      {/* Botón de abrir chat */}
                      <button
                        onClick={() => handleOpenSession(session)}
                        className="py-1 px-3 text-xs font-semibold bg-accent text-bg hover:opacity-90 rounded-lg transition-opacity cursor-pointer shadow-sm shrink-0"
                      >
                        Abrir Chat
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* VISTA B: CONSOLA DE TRACES (LOGS) */
        <div className="flex-1 flex flex-col min-h-0">
          {/* Controles de Consola */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 bg-surface border border-surface-hover rounded-xl mb-4 flex-shrink-0 text-xs text-text-secondary">
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

            <div className="flex items-center gap-3 ml-auto">
              <div className="flex items-center gap-1.5 select-none">
                <span className={`w-2 h-2 rounded-full ${wsConnected ? "bg-success animate-pulse" : "bg-error"}`} />
                <span className="text-[10px] font-mono">{wsConnected ? "ws-connected" : "ws-disconnected"}</span>
              </div>

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

              <button
                onClick={() => setLogs([])}
                className="px-3 py-1.5 rounded-lg border border-surface-hover hover:bg-surface-hover text-text-secondary hover:text-text-primary transition-colors cursor-pointer font-semibold"
              >
                Limpiar Pantalla
              </button>
            </div>
          </div>

          {/* Pantalla del terminal de Logs */}
          <div className="flex-1 bg-surface border border-surface-hover rounded-xl shadow-2xl overflow-hidden flex flex-col min-h-0 relative">
            {logsLoading ? (
              <div className="flex-1 flex flex-col items-center justify-center space-y-2 text-text-secondary/55">
                <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                <span className="text-xs">Cargando trazas...</span>
              </div>
            ) : filteredLogs.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-text-secondary/40 text-xs font-mono select-none">
                &gt;_ Esperando trazas de logs del sistema...
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto p-4 font-mono text-[11px] text-text-primary space-y-2 selection:bg-accent/30 selection:text-text-primary">
                {filteredLogs.map((log, idx) => renderLogLine(log, idx))}
                <div ref={consoleEndRef} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
