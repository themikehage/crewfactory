import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { RichMarkdown } from "../RichMarkdown";

interface Props {
  parentId: string;
  toolCallId: string;
  task: string;
  subagentRole?: string;
  onClose: () => void;
}

interface ConsoleStep {
  id: string;
  name: string;
  args?: any;
  status: "running" | "success" | "error";
  result?: string;
}

export function SubagentConsole({ parentId, toolCallId, task, subagentRole, onClose }: Props) {
  const [messages, setMessages] = useState<any[]>([]);
  const [steps, setSteps] = useState<ConsoleStep[]>([]);
  const [status, setStatus] = useState<string>("running");
  const [isAborting, setIsAborting] = useState(false);
  const terminalEndRef = useRef<HTMLDivElement>(null);
  const terminalContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 1. Fetch historical messages
    const fetchHistory = async () => {
      try {
        const token = localStorage.getItem("token");
        const res = await fetch(`/api/sessions/${parentId}/subagents/${toolCallId}/messages`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          if (data.metadata) {
            setStatus(data.metadata.status || "success");
          }
          if (data.messages) {
            setMessages(data.messages);
            const loadedSteps: ConsoleStep[] = [];
            for (const msg of data.messages) {
              if (msg.role === "assistant" && msg.content && Array.isArray(msg.content)) {
                const toolCalls = msg.content.filter((c: any) => c.type === "toolCall");
                for (const tc of toolCalls) {
                  loadedSteps.push({
                    id: tc.id,
                    name: tc.name,
                    args: tc.arguments,
                    status: "success",
                  });
                }
              }
            }
            setSteps(loadedSteps);
          }
        }
      } catch (err) {
        console.error("Failed to load subagent history:", err);
      }
    };

    fetchHistory();
  }, [parentId, toolCallId]);

  useEffect(() => {
    // 2. Listen to WebSocket events in real-time
    const handleEvent = (event: Event) => {
      const customEvt = event as CustomEvent;
      const evt = customEvt.detail;
      if (!evt) return;

      if (evt.type === "message_start") {
        setMessages((prev) => {
          const msg = evt.message;
          const last = prev[prev.length - 1];
          if (last && last.isStreaming) {
            return [...prev.slice(0, -1), { ...msg, isStreaming: true }];
          }
          return [...prev, { ...msg, isStreaming: true }];
        });
      } else if (evt.type === "message_update") {
        setMessages((prev) => {
          const msg = evt.message;
          const last = prev[prev.length - 1];
          if (last && last.isStreaming) {
            return [...prev.slice(0, -1), { ...msg, isStreaming: true }];
          }
          return [...prev, { ...msg, isStreaming: true }];
        });
      } else if (evt.type === "message_end") {
        setMessages((prev) => {
          const msg = evt.message;
          const last = prev[prev.length - 1];
          if (last && last.isStreaming) {
            return [...prev.slice(0, -1), msg];
          }
          return [...prev, msg];
        });
      } else if (evt.type === "tool_execution_start") {
        setSteps((prev) => [
          ...prev,
          {
            id: evt.toolCallId,
            name: evt.toolName,
            args: evt.args,
            status: "running"
          }
        ]);
      } else if (evt.type === "tool_execution_end") {
        setSteps((prev) =>
          prev.map((step) =>
            step.id === evt.toolCallId
              ? { ...step, status: evt.isError ? "error" : "success", result: evt.result }
              : step
          )
        );
      } else if (evt.type === "agent_start") {
        setStatus("running");
      } else if (evt.type === "agent_end") {
        setStatus("success");
      } else if (evt.type === "agent_error") {
        setStatus("error");
      }
    };

    window.addEventListener(`subagent-event-${toolCallId}`, handleEvent);
    return () => {
      window.removeEventListener(`subagent-event-${toolCallId}`, handleEvent);
    };
  }, [toolCallId]);

  useEffect(() => {
    // Auto-scroll terminal container
    if (terminalContainerRef.current) {
      const container = terminalContainerRef.current;
      container.scrollTop = container.scrollHeight;
    }
  }, [messages, steps]);

  const handleAbort = async () => {
    setIsAborting(true);
    try {
      const token = localStorage.getItem("token");
      await fetch(`/api/sessions/${parentId}/subagents/${toolCallId}/abort`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });
      setStatus("blocked");
    } catch (err) {
      console.error("Failed to abort subagent:", err);
    } finally {
      setIsAborting(false);
    }
  };

  const getStatusBadge = () => {
    if (status === "running") {
      return (
        <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-warning/15 text-warning">
          <span className="w-1.5 h-1.5 rounded-full bg-warning animate-pulse" />
          RUNNING
        </span>
      );
    }
    if (status === "success") {
      return (
        <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-success/15 text-success">
          <span className="w-1.5 h-1.5 rounded-full bg-success" />
          SUCCESS
        </span>
      );
    }
    if (status === "blocked") {
      return (
        <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-500/10 text-red-500">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
          ABORTED
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-600/15 text-red-500">
        <span className="w-1.5 h-1.5 rounded-full bg-red-600" />
        ERROR
      </span>
    );
  };

  return (
    <motion.div
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={{ duration: 0.2, ease: "easeInOut" }}
      className="w-85 sm:w-110 flex flex-col h-full bg-card border-l border-border flex-shrink-0 relative z-20 shadow-2xl"
    >
      {/* Header */}
      <div className="h-12 border-b border-border flex items-center justify-between px-3 flex-shrink-0 bg-card/60 backdrop-blur-xs">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono font-bold text-text-primary">Subagente Consola</span>
          {getStatusBadge()}
        </div>

        <div className="flex items-center gap-2">
          {status === "running" && (
            <button
              onClick={handleAbort}
              disabled={isAborting}
              className="bg-destructive hover:bg-destructive/80 text-destructive-foreground px-2 py-0.5 rounded-md text-[10px] font-semibold transition-all disabled:opacity-50 cursor-pointer"
            >
              {isAborting ? "Aborting..." : "Abort"}
            </button>
          )}
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground p-1 cursor-pointer transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </div>

      {/* Main Body content */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 min-h-0">
        
        {/* Subagent Meta Details */}
        <div className="rounded-lg bg-surface border border-border p-3 flex flex-col gap-1.5 flex-shrink-0">
          <div className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Rol Asignado</div>
          <div className="text-xs text-text-primary font-mono">{subagentRole || "Executor General"}</div>
          
          <div className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground mt-2">Objetivo del Spawning</div>
          <div className="text-xs text-text-primary leading-relaxed bg-bg border border-border p-2 rounded-md max-h-24 overflow-y-auto whitespace-pre-wrap font-mono select-text">
            {task}
          </div>
        </div>

        {/* Steps Ledger Timeline */}
        {steps.length > 0 && (
          <div className="flex flex-col gap-2 flex-shrink-0">
            <div className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground px-1">Llamadas a Herramientas ({steps.length})</div>
            <div className="flex flex-col gap-1.5 bg-surface border border-border rounded-lg p-2.5">
              {steps.map((step, idx) => (
                <div key={idx} className="flex items-center gap-2 text-[11px] font-mono">
                  {step.status === "running" ? (
                    <span className="w-2 h-2 rounded-full bg-warning animate-pulse" />
                  ) : step.status === "error" ? (
                    <span className="w-2 h-2 rounded-full bg-destructive" />
                  ) : (
                    <span className="w-2 h-2 rounded-full bg-success" />
                  )}
                  <span className="font-bold text-muted-foreground">{step.name}</span>
                  <span className="text-muted-foreground truncate max-w-40">
                    {step.args ? JSON.stringify(step.args) : ""}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Terminal logs block */}
        <div className="flex-1 flex flex-col min-h-24">
          <div className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground px-1 mb-1.5">Consola de Ejecución</div>
          <div 
            ref={terminalContainerRef}
            className="flex-1 rounded-lg bg-bg border border-border p-3 overflow-y-auto font-mono text-[11px] leading-relaxed text-text-primary flex flex-col gap-2 select-text"
          >
            {messages.length === 0 ? (
              <div className="text-muted-foreground italic">Iniciando subagente, esperando logs...</div>
            ) : (
              messages.map((msg, idx) => {
                if (msg.role === "user") {
                  return (
                    <div key={idx} className="border-b border-border/40 pb-1 text-muted-foreground">
                      <span className="text-primary">&gt;</span> Prompt recibido por el subagente.
                    </div>
                  );
                }
                
                let thinkingText = "";
                let outputText = "";

                if (typeof msg.content === "string") {
                  outputText = msg.content;
                } else if (Array.isArray(msg.content)) {
                  const thinkingBlock = msg.content.find((c: any) => c.type === "thinking");
                  const textBlock = msg.content.find((c: any) => c.type === "text");
                  if (thinkingBlock) thinkingText = thinkingBlock.thinking || "";
                  if (textBlock) outputText = textBlock.text || "";
                }

                return (
                  <div key={idx} className="flex flex-col gap-1">
                    {thinkingText && (
                      <div className="text-[10px] text-muted-foreground italic border-l-2 border-border pl-2 py-0.5 leading-snug">
                        Pensamiento: {thinkingText}
                      </div>
                    )}
                    {outputText && (
                      <div className="leading-normal text-text-primary">
                        <RichMarkdown content={outputText} />
                      </div>
                    )}
                  </div>
                );
              })
            )}
            <div ref={terminalEndRef} />
          </div>
        </div>

      </div>
    </motion.div>
  );
}
