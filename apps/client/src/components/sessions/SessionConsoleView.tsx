import { useState, useEffect, useRef, useMemo } from "react";
import { useLiterals } from "@/lib";
import { literals as u } from "@/pages/LogsConsolePage.literals";
import type { GlobalLogEvent } from "shared";
import { Dropdown } from "@/components/ui/Dropdown";
import { apiFetch } from "@/lib/api";

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

export function SessionConsoleView() {
  const l = useLiterals(u);

  const [logs, setLogs] = useState<GlobalLogEvent[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [wsConnected, setWsConnected] = useState(false);
  const [pauseScroll, setPauseScroll] = useState(false);

  const [filterSource, setFilterSource] = useState<"all" | "session" | "channel">("all");
  const [showMessages, setShowMessages] = useState(true);
  const [showThinking, setShowThinking] = useState(true);
  const [showTools, setShowTools] = useState(true);

  const consoleEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = await apiFetch("/api/logs");
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

  useEffect(() => {
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${location.host}/ws`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setWsConnected(true);
      ws.send(JSON.stringify({ type: "auth" }));
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

  useEffect(() => {
    if (!pauseScroll && consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, pauseScroll]);

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
    <div className="flex-1 flex flex-col min-h-0 p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 bg-card border border-input rounded-xl mb-4 flex-shrink-0 text-xs text-muted-foreground">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-foreground">{l.sourceLabel}</span>
            <Dropdown<"all" | "session" | "channel">
              value={filterSource}
              onChange={setFilterSource}
              options={[
                { value: "all", label: l.filterAll },
                { value: "session", label: l.filterSession },
                { value: "channel", label: l.filterChannel },
              ]}
              size="xs"
            />
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

      <div className="flex-1 bg-card border border-input rounded-xl shadow-2xl overflow-hidden flex flex-col min-h-0 relative">
        {logsLoading ? (
          <div className="flex-1 flex flex-col items-center justify-center space-y-2 text-muted-foreground">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <span className="text-xs">Cargando trazas...</span>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground text-xs p-4 font-mono select-none">
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
  );
}
