import { useState, useEffect, useRef, useMemo } from "react";
import { useSessionStatusWs } from "@/hooks/useSessionStatusWs";
import { useLiterals } from "@/lib";
import { literals as u } from "./LogsConsolePage.literals";
import type { GlobalLogEvent } from "shared";
import { Button } from "@/components/ui/Button";

interface SessionItem {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  status?: string;
  projectName?: string;
  agentId?: string;
  channelId?: string;
}

interface LogsConsolePageProps {
  onSelectProject: (projectId: string | null, projectName: string | null) => void;
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
  onSelectProject,
  onSelectAgent,
  onSelectChannel,
  onNavigate,
}: LogsConsolePageProps) {
  const l = useLiterals(u);
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
    if (s.projectName) {
      onSelectProject(s.projectName, s.projectName);
    } else if (s.channelId) {
      const name = channelNamesMap.get(s.channelId) || s.channelId;
      onSelectChannel({ id: s.channelId, name });
    } else if (s.agentId) {
      const name = agentNamesMap.get(s.agentId) || s.agentId;
      onSelectAgent({ id: s.agentId, name });
    } else {
      onSelectProject(null, null);
      onSelectAgent(null);
      onSelectChannel(null);
    }
    // 2. Redirigir
    onNavigate(`/session/${s.id}`);
  };

  const formatRelativeTime = (updatedAt: string, status?: string) => {
    if (status === "streaming" || status === "task-running") return l.statusActive;
    try {
      const past = new Date(updatedAt).getTime();
      const now = Date.now();
      const diffMs = now - past;
      const diffSec = Math.floor(diffMs / 1000);
      const diffMin = Math.floor(diffSec / 60);
      const diffHour = Math.floor(diffMin / 60);

      if (diffSec < 30) return l.statusMomentsAgo;
      if (diffSec < 60) return `Hace ${diffSec} segundos`;
      if (diffMin < 60) return `Hace ${diffMin} ${diffMin === 1 ? l.statusMinutesAgo : l.statusMinutesAgo + "s"}`;
      if (diffHour < 24) return `Hace ${diffHour} ${diffHour === 1 ? l.statusHoursAgo : l.statusHoursAgo + "s"}`;
      return new Date(updatedAt).toLocaleDateString();
    } catch {
      return l.statusNoActivity;
    }
  };

  const renderLogLine = (log: GlobalLogEvent, idx: number) => {
    const sourceColor = log.sourceType === "channel" ? "text-purple-400" : "text-blue-400";
    const sourceLabel = log.sourceType === "channel" ? l.labelSourceChannel : l.labelSourceSession;
    const timestamp = new Date(log.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const sourceName = log.sourceName || log.sourceId.substring(0, 8);

    const renderContent = () => {
      switch (log.eventType) {
        case "user_message":
          return (
            <span>
              <span className="font-semibold text-muted-foreground">{l.labelUser}</span>: "{log.detail}"
            </span>
          );
        case "agent_message":
          return (
            <span>
              <span className="font-semibold text-purple-400">{l.labelResponse}</span>: "{log.detail}"
            </span>
          );
        case "agent_start":
          return <span className="text-success/80 italic">Iniciando respuesta...</span>;
        case "agent_end":
          return <span className="text-muted-foreground italic">Finalizo respuesta.</span>;
        case "text_delta":
          return (
            <span>
              <span className="font-semibold text-muted-foreground">{l.labelWriting}</span>: {log.detail}
            </span>
          );
        case "thinking_delta":
          return (
            <span className="text-primary/60">
              <span className="font-semibold text-primary/80">{l.labelThinking}</span>: {log.detail}
            </span>
          );
        case "tool_start":
          return (
            <span className="text-warning/80">
              <span className="font-bold">{l.labelToolStart}</span>: <span className="text-warning font-mono">{log.detail.toolName}</span>
              <span className="text-muted-foreground"> ({JSON.stringify(log.detail.args)})</span>
            </span>
          );
        case "tool_end":
          return (
            <span className={log.detail.isError ? "text-destructive/80" : "text-success/80"}>
              <span className="font-bold">{l.labelToolEnd}</span>: <span className={log.detail.isError ? "text-destructive font-mono" : "text-success font-mono"}>{log.detail.toolName}</span>
              <span className="text-muted-foreground"> ({log.detail.isError ? l.toolError : l.toolSuccess}{!log.detail.isError && log.detail.result ? ` - ${typeof log.detail.result === "string" ? log.detail.result.slice(0, 120) : JSON.stringify(log.detail.result).slice(0, 120)}` : ""}{log.detail.isError && log.detail.result ? ` - ${String(log.detail.result)}` : ""})</span>
            </span>
          );
        case "error":
          return <span className="text-destructive font-semibold">Error: {log.detail}</span>;
        default:
          return <span className="text-muted-foreground">{log.detail || log.eventType}</span>;
      }
    };

    return (
      <div key={idx} className="hover:bg-card-hover/15 px-3 py-1 text-[11px] leading-relaxed">
        <span className="text-muted-foreground select-none">[{timestamp}]</span>{" "}
        <span className={`font-bold ${sourceColor} select-none`}>[{sourceLabel}: {sourceName}]</span>{" "}
        {log.agentName && (
          <span className="bg-purple-400/10 text-purple-400 px-1 py-0.5 rounded text-[10px] font-semibold select-none mr-1">
            @{log.agentName}
          </span>
        )}
        {renderContent()}
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-hidden p-4 sm:p-6 font-sans">
      {/* Selector de Pestañas */}
      <div className="flex border-b border-input mb-4 flex-shrink-0">
        <button
          onClick={() => setActiveTab("sessions")}
          className={`px-4 py-2 text-xs font-semibold cursor-pointer border-b-2 transition-all ${
            activeTab === "sessions"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          {l.tabSessions}
        </button>
        <button
          onClick={() => setActiveTab("logs")}
          className={`px-4 py-2 text-xs font-semibold cursor-pointer border-b-2 transition-all ${
            activeTab === "logs"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          {l.tabLogs}
        </button>
      </div>

      {activeTab === "sessions" ? (
        /* VISTA A: GRILLA DE SESIONES */
        <div className="flex-1 overflow-y-auto min-h-0">
          {sessionsLoading ? (
            <div className="flex flex-col items-center justify-center py-20 space-y-2 text-muted-foreground">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <span className="text-xs">{l.loadingSessions}</span>
            </div>
          ) : displaySessions.length === 0 ? (
            <div className="text-center text-muted-foreground text-xs py-20">
              {l.noActiveSessions}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {displaySessions.map((session) => {
                // Resolver el tipo y color del badge del contexto de la sesión
                let badgeText: string;
                let badgeColor = "bg-text-secondary/10 text-muted-foreground border-text-secondary/20";

                if (session.projectName) {
                  badgeText = `${l.badgeProject} ${session.projectName}`;
                  badgeColor = "bg-blue-400/10 text-blue-400 border-blue-400/20";
                } else if (session.channelId) {
                  const chName = channelNamesMap.get(session.channelId) || session.channelId;
                  badgeText = `${l.badgeChannel} #${chName}`;
                  badgeColor = "bg-purple-400/10 text-purple-400 border-purple-400/20";
                } else if (session.agentId) {
                  const agName = agentNamesMap.get(session.agentId) || session.agentId;
                  badgeText = `${l.badgeAgent} ${agName}`;
                  badgeColor = "bg-amber-400/10 text-amber-400 border-amber-400/20";
                } else {
                  badgeText = l.badgeGlobal;
                }

                let statusDotColor = "bg-text-secondary/40";
                let statusLabel = l.statusInactive;
                if (session.status === "streaming") {
                  statusDotColor = "bg-warning animate-pulse";
                  statusLabel = l.statusStreaming;
                } else if (session.status === "task-running") {
                  statusDotColor = "bg-primary animate-pulse";
                  statusLabel = l.statusTaskRunning;
                } else if (session.status === "active") {
                  statusDotColor = "bg-primary";
                  statusLabel = l.statusActive;
                }

                return (
                  <div
                    key={session.id}
                    className="bg-card border border-input/60 rounded-xl p-4 flex flex-col justify-between hover:border-primary/30 transition-all shadow-md gap-3"
                  >
                    <div>
                      {/* Cabecera de la tarjeta: Título y Dot de Estado */}
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <h3 className="font-semibold text-foreground text-sm truncate flex-1 leading-snug">
                          {session.name}
                        </h3>
                        <span className="flex items-center gap-1 text-xs font-semibold text-muted-foreground shrink-0 select-none">
                          <span className={`w-1.5 h-1.5 rounded-full ${statusDotColor}`} />
                          {statusLabel}
                        </span>
                      </div>

                      {/* Badge de Contexto */}
                      <div className="flex flex-wrap gap-2 items-center mb-1 select-none">
                        <span className={`text-xs uppercase tracking-wider font-bold px-2 py-0.5 rounded-md border ${badgeColor}`}>
                          {badgeText}
                        </span>
                      </div>
                    </div>

                    <div className="border-t border-input/30 pt-3 flex items-center justify-between mt-1 text-xs text-muted-foreground select-none">
                      {/* Última actividad / Tiempo relativo */}
                      <div className="flex flex-col">
                        <span className="text-muted-foreground uppercase tracking-widest text-xs font-bold">{l.labelActivity}</span>
                        <span className="font-medium text-muted-foreground/80">
                          {formatRelativeTime(session.updatedAt, session.status)}
                        </span>
                      </div>

                      {/* Botón de abrir chat */}
                      <Button size="sm" onClick={() => handleOpenSession(session)}>
                        {l.openChat}
                      </Button>
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
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 bg-card border border-input rounded-xl mb-4 flex-shrink-0 text-xs text-muted-foreground">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-foreground">{l.sourceLabel}</span>
                <select
                  value={filterSource}
                  onChange={(e) => setFilterSource(e.target.value as any)}
                  className="bg-background border border-input rounded px-2.5 py-1 text-foreground outline-none focus:border-primary cursor-pointer"
                >
                  <option value="all">{l.filterAll}</option>
                  <option value="session">{l.filterSession}</option>
                  <option value="channel">{l.filterChannel}</option>
                </select>
              </div>

              <div className="flex items-center gap-3 border-l border-input pl-4 select-none">
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
                <span className={`w-2 h-2 rounded-full ${wsConnected ? "bg-primary animate-pulse" : "bg-destructive"}`} />
                <span className="text-xs font-mono">{wsConnected ? "ws-connected" : "ws-disconnected"}</span>
              </div>

              <button
                onClick={() => setPauseScroll(!pauseScroll)}
                className={`px-3 py-1.5 rounded-lg border font-semibold transition-colors cursor-pointer ${
                  pauseScroll
                    ? "border-primary/40 bg-primary/15 text-primary"
                    : "border-input hover:bg-card-hover text-muted-foreground hover:text-foreground"
                }`}
              >
                {pauseScroll ? "Reanudar Autoscroll" : "Congelar Scroll"}
              </button>

              <button
                onClick={() => setLogs([])}
                className="px-3 py-1.5 rounded-lg border border-input hover:bg-card-hover text-muted-foreground hover:text-foreground transition-colors cursor-pointer font-semibold"
              >
                Limpiar Pantalla
              </button>
            </div>
          </div>

          {/* Pantalla del terminal de Logs */}
          <div className="flex-1 bg-card border border-input rounded-xl shadow-2xl overflow-hidden flex flex-col min-h-0 relative">
            {logsLoading ? (
              <div className="flex-1 flex flex-col items-center justify-center space-y-2 text-muted-foreground">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <span className="text-xs">Cargando trazas...</span>
              </div>
            ) : filteredLogs.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground text-xs font-mono select-none">
                &gt;_ Esperando trazas de logs del sistema...
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto py-2 font-mono text-foreground selection:bg-primary/30 selection:text-foreground">
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
