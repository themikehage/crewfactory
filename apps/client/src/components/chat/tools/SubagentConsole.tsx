import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ThinkingBlock, AssistantTextBlock } from "../MessageBlocks";
import { AgentAvatar } from "@/components/shared/AgentAvatar";

interface Props {
  parentId: string;
  toolCallId: string;
  task: string;
  subagentRole?: string;
  onClose: () => void;
  sessionId: string | null;
  activeProjectName?: string | null;
  activeAgentId?: string | null;
  activeAgentName?: string | null;
  activeAgentAvatarUrl?: string | null;
  activeChannelId?: string | null;
}

interface ConsoleStep {
  id: string;
  name: string;
  args?: any;
  status: "running" | "success" | "error";
  result?: string;
}

export function SubagentConsole({
  parentId,
  toolCallId,
  task,
  subagentRole,
  onClose,
  sessionId,
  activeProjectName,
  activeAgentId,
  activeAgentName,
  activeAgentAvatarUrl,
  activeChannelId,
}: Props) {
  const [messages, setMessages] = useState<any[]>([]);
  const [steps, setSteps] = useState<ConsoleStep[]>([]);
  const [status, setStatus] = useState<string>("running");
  const [isAborting, setIsAborting] = useState(false);
  const [activeTab, setActiveTab] = useState<"execution" | "tools">("execution");
  const terminalEndRef = useRef<HTMLDivElement>(null);
  const terminalContainerRef = useRef<HTMLDivElement>(null);
  const toolsContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const token = localStorage.getItem("token");
        const res = await fetch(`/api/sessions/${parentId}/subagents/${toolCallId}/messages`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          if (data.metadata) {
            setStatus(data.metadata.status || "success");
          }
          if (data.messages) {
            const flatMessages = data.messages
              .map((m: any) => {
                if (m.type === "message" && m.message) {
                  return m.message;
                }
                return m;
              })
              .filter((m: any) => m.role === "user" || m.role === "assistant");

            setMessages(flatMessages);
            const loadedSteps: ConsoleStep[] = [];
            for (const msg of flatMessages) {
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
            status: "running",
          },
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
    if (terminalContainerRef.current) {
      terminalContainerRef.current.scrollTop = terminalContainerRef.current.scrollHeight;
    }
  }, [messages, steps]);

  const handleAbort = async () => {
    setIsAborting(true);
    try {
      const token = localStorage.getItem("token");
      await fetch(`/api/sessions/${parentId}/subagents/${toolCallId}/abort`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
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
        <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-error/10 text-error">
          <span className="w-1.5 h-1.5 rounded-full bg-error" />
          ABORTED
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-error/15 text-error">
        <span className="w-1.5 h-1.5 rounded-full bg-error" />
        ERROR
      </span>
    );
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-background/80 backdrop-blur-sm"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <motion.div
          initial={{ scale: 0.96, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.96, opacity: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="w-full max-w-5xl h-[90vh] bg-card border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="h-13 border-b border-border flex items-center justify-between px-4 flex-shrink-0 bg-card/80 backdrop-blur-sm">
            <div className="flex items-center gap-3">
              <span className="text-sm font-mono font-bold text-text-primary">Subagente Consola</span>
              {getStatusBadge()}
            </div>

            <div className="flex items-center gap-2">
              {status === "running" && (
                <button
                  onClick={handleAbort}
                  disabled={isAborting}
                  className="bg-destructive hover:bg-destructive/80 text-destructive-foreground px-3 py-1 rounded-md text-[11px] font-semibold transition-all disabled:opacity-50 cursor-pointer"
                >
                  {isAborting ? "Aborting..." : "Abort"}
                </button>
              )}
              <button
                onClick={onClose}
                className="text-muted-foreground hover:text-foreground p-1.5 rounded-lg hover:bg-card-hover/40 cursor-pointer transition-colors"
              >
                <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          </div>

          <div className="flex items-center gap-1 px-4 pt-3 pb-2 border-b border-border/40 flex-shrink-0">
            <button
              onClick={() => setActiveTab("execution")}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                activeTab === "execution"
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-card-hover/30"
              }`}
            >
              Ejecución
            </button>
            <button
              onClick={() => setActiveTab("tools")}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === "tools"
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-card-hover/30"
              }`}
            >
              Herramientas
              {steps.length > 0 && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                  activeTab === "tools" ? "bg-card border border-border text-muted-foreground" : "bg-muted text-muted-foreground"
                }`}>
                  {steps.length}
                </span>
              )}
            </button>
          </div>

          <div className="flex-1 flex min-h-0">
            {activeTab === "execution" ? (
              <div className="flex-1 flex flex-col min-h-0">
                {messages.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center gap-4 text-muted-foreground min-h-0">
                    <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    <span className="text-xs font-mono">Iniciando subagente, esperando logs...</span>
                  </div>
                ) : (
                  <div
                    ref={terminalContainerRef}
                    className="flex-1 overflow-y-auto min-h-0 px-6 py-4 font-mono text-[12px] leading-relaxed text-text-primary flex flex-col gap-3"
                  >
                      {messages.map((msg, idx) => {
                        if (msg.role === "user") {
                          return (
                            <motion.div
                              key={idx}
                              initial={{ opacity: 0, y: 4 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ duration: 0.15 }}
                              className="flex gap-3 items-start"
                            >
                              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/15 flex items-center justify-center mt-0.5">
                                <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor" className="text-primary">
                                  <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                                </svg>
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-[10px] font-semibold text-primary uppercase tracking-wider mb-1">User Prompt</div>
                                <div className="text-text-secondary leading-relaxed bg-surface/30 rounded-lg px-3 py-2 border border-border/20">
                                  Prompt recibido por el subagente.
                                </div>
                              </div>
                            </motion.div>
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
                          <motion.div
                            key={idx}
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.15 }}
                            className="flex gap-3 items-start"
                          >
                            <div className="flex-shrink-0 mt-0.5">
                              <AgentAvatar
                                name={activeAgentName || "Subagent"}
                                avatarUrl={activeAgentAvatarUrl}
                                size="sm"
                              />
                            </div>
                            <div className="flex-1 min-w-0 space-y-1.5">
                              <div className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider">
                                {activeAgentName || "Subagent"}
                              </div>
                              <div className="text-text-primary leading-relaxed">
                                {thinkingText && <ThinkingBlock thinking={thinkingText} />}
                                {outputText && (
                                  <AssistantTextBlock
                                    text={outputText}
                                    sessionId={sessionId}
                                    activeProjectName={activeProjectName}
                                    activeAgentId={activeAgentId}
                                    activeChannelId={activeChannelId}
                                  />
                                )}
                              </div>
                            </div>
                          </motion.div>
                        );
                      })}
                      <div ref={terminalEndRef} />
                    </div>
                  )}

                <div className="flex-shrink-0 border-t border-border/40 px-4 py-2.5 flex items-center gap-4 text-[11px] text-muted-foreground font-mono bg-card/50">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] uppercase tracking-wider font-semibold">Rol:</span>
                    <span className="text-text-primary">{subagentRole || "Executor General"}</span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    <span className="text-[10px] uppercase tracking-wider font-semibold flex-shrink-0">Objetivo:</span>
                    <span className="text-text-primary truncate">{task}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div
                ref={toolsContainerRef}
                className="flex-1 overflow-y-auto px-6 py-4"
              >
                {steps.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-muted-foreground text-xs font-mono">
                    No se han ejecutado herramientas todavía.
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {steps.map((step, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-card-hover/20 transition-colors group"
                      >
                        {step.status === "running" ? (
                          <span className="w-2.5 h-2.5 rounded-full bg-warning animate-pulse flex-shrink-0" />
                        ) : step.status === "error" ? (
                          <span className="w-2.5 h-2.5 rounded-full bg-destructive flex-shrink-0" />
                        ) : (
                          <span className="w-2.5 h-2.5 rounded-full bg-success flex-shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-foreground font-mono text-[12px]">{step.name}</span>
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                              step.status === "running" ? "bg-warning/10 text-warning" :
                              step.status === "error" ? "bg-destructive/10 text-destructive" :
                              "bg-success/10 text-success"
                            }`}>
                              {step.status.toUpperCase()}
                            </span>
                          </div>
                          {step.args && (
                            <div className="text-[11px] text-muted-foreground font-mono mt-0.5 truncate max-w-2xl opacity-0 group-hover:opacity-100 transition-opacity">
                              {JSON.stringify(step.args)}
                            </div>
                          )}
                          {step.result && step.status !== "running" && (
                            <div className="text-[11px] text-muted-foreground font-mono mt-1 bg-muted/50 rounded px-2 py-1.5 max-h-32 overflow-y-auto whitespace-pre-wrap">
                              {typeof step.result === "string" ? step.result.slice(0, 500) : JSON.stringify(step.result).slice(0, 500)}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
