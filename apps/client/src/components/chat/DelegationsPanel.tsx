import { useCallback, useEffect, useState } from "react";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useLiterals } from "@/lib";
import { literals as u } from "./DelegationsPanel.literals";
import { useRouter } from "@/hooks/useRouter";
import type { PendingDelegation } from "./FloatingDelegations";
import { motion, AnimatePresence } from "framer-motion";

interface Props {
  sessionId: string | null;
  activeProjectName?: string | null;
  activeAgent?: { id: string; name: string } | null;
  activeChannel?: { id: string; name: string } | null;
}

export function DelegationsPanel({ sessionId, activeProjectName, activeAgent = null, activeChannel = null }: Props) {
  const l = useLiterals(u);
  const { navigate } = useRouter();
  const [delegations, setDelegations] = useState<PendingDelegation[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDelegationId, setSelectedDelegationId] = useState<string | null>(null);

  const { subscribe } = useWebSocket(null);

  const getSessionPath = useCallback((id: string) => {
    let basePath = "";
    if (activeChannel) basePath = `/channels/${activeChannel.id}`;
    else if (activeAgent) basePath = `/agents/${activeAgent.id}`;
    else if (activeProjectName) basePath = `/projects/${activeProjectName}`;
    return id ? `${basePath}/session/${id}` : (basePath ? `${basePath}/chat` : "/");
  }, [activeChannel, activeAgent, activeProjectName]);

  const fetchDelegations = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/sessions/${sessionId}/delegations`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setDelegations(data.delegations ?? []);
      }
    } catch (e) {
      console.error("Failed to fetch delegations in panel:", e);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    fetchDelegations();

    if (!sessionId) {
      setDelegations([]);
      return;
    }

    const unsubDelStarted = subscribe("delegation_started", (data: any) => {
      if (data.parentSessionId !== sessionId) return;
      setDelegations((prev) => {
        const exists = prev.some(d => d.toolCallId === data.toolCallId);
        if (exists) return prev;
        return [...prev, {
          toolCallId: data.toolCallId,
          subagentSessionId: data.subagentSessionId,
          task: data.task,
          targetType: data.targetType,
          status: "running",
          startedAt: new Date().toISOString()
        }];
      });
    });

    const unsubDelCompleted = subscribe("delegation_completed", (data: any) => {
      if (data.parentSessionId !== sessionId) return;
      setDelegations((prev) => prev.map(d => {
        if (d.toolCallId === data.toolCallId) {
          return {
            ...d,
            status: data.status,
            completedAt: new Date().toISOString(),
            result: data.result
          };
        }
        return d;
      }));
    });

    return () => {
      unsubDelStarted();
      unsubDelCompleted();
    };
  }, [sessionId, subscribe, fetchDelegations]);

  const selectedDelegation = delegations.find(d => d.toolCallId === selectedDelegationId);

  if (!sessionId) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-bg px-4 select-none">
        <div className="w-16 h-16 rounded-full bg-surface border border-border flex items-center justify-center mb-4 text-text-secondary opacity-75">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
          </svg>
        </div>
        <h2 className="text-base font-semibold text-text-primary mb-1 font-display">{l.noActiveSession}</h2>
        <p className="text-xs text-text-secondary text-center max-w-sm">{l.noActiveSessionDesc}</p>
      </div>
    );
  }

  if (loading && delegations.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-bg">
        <div className="w-8 h-8 border-3 border-accent border-t-transparent rounded-full animate-spin mb-3" />
        <span className="text-xs font-mono text-text-secondary animate-pulse">Cargando delegaciones...</span>
      </div>
    );
  }

  if (delegations.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-bg px-4 select-none">
        <div className="w-16 h-16 rounded-full bg-surface border border-border flex items-center justify-center mb-4 text-text-secondary opacity-75">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0110 21a3.745 3.745 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.745 3.745 0 013.296-1.043A3.745 3.745 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
          </svg>
        </div>
        <h2 className="text-base font-semibold text-text-primary mb-1 font-display">{l.noDelegations}</h2>
        <p className="text-xs text-text-secondary text-center max-w-sm">{l.noDelegationsDesc}</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col md:flex-row min-w-0 bg-bg overflow-hidden">
      {/* List Area */}
      <div className={`flex-1 flex flex-col min-w-0 h-full ${selectedDelegationId ? "hidden md:flex" : "flex"}`}>
        <div className="p-4 border-b border-border bg-surface/30">
          <h2 className="text-base font-semibold text-text-primary font-display">{l.title}</h2>
          <p className="text-xs text-text-secondary">{l.subtitle}</p>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <AnimatePresence initial={false}>
            {delegations.map((d) => {
              const isRunning = d.status === "running";
              const isSelected = selectedDelegationId === d.toolCallId;
              let statusBg = "bg-accent/10 border-accent/20 text-accent";
              let statusColor = "bg-accent";
              let statusText = l.running;

              if (d.status === "success") {
                statusBg = "bg-green-500/10 border-green-500/20 text-green-400";
                statusColor = "bg-green-500";
                statusText = l.success;
              } else if (d.status === "error") {
                statusBg = "bg-red-500/10 border-red-500/20 text-red-400";
                statusColor = "bg-red-500";
                statusText = l.error;
              } else if (d.status === "blocked") {
                statusBg = "bg-yellow-500/10 border-yellow-500/20 text-yellow-400";
                statusColor = "bg-yellow-500";
                statusText = l.blocked;
              }

              return (
                <motion.div
                  layout
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  key={d.toolCallId}
                  onClick={() => setSelectedDelegationId(d.toolCallId)}
                  className={`p-3 rounded-lg border cursor-pointer transition-all duration-150 flex flex-col gap-2.5 ${
                    isSelected
                      ? "bg-surface border-accent/50 shadow-md shadow-accent/5"
                      : "bg-surface/50 border-border hover:bg-surface hover:border-border/80"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[9px] font-mono text-text-secondary uppercase px-1.5 py-0.5 rounded bg-bg border border-border">
                        {d.targetType}
                      </span>
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${statusBg} flex items-center gap-1.5 font-medium`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${statusColor} ${isRunning ? "animate-pulse" : ""}`} />
                        {statusText}
                      </span>
                    </div>
                    <span className="text-[10px] text-text-secondary font-mono">
                      {d.startedAt ? new Date(d.startedAt).toLocaleTimeString() : ""}
                    </span>
                  </div>
                  <h3 className="text-xs font-medium text-text-primary leading-relaxed break-words line-clamp-2">
                    {d.task}
                  </h3>
                  <div className="flex items-center justify-between border-t border-border/30 pt-2 text-[10px] text-text-secondary">
                    <span className="font-mono text-[9px] truncate max-w-[150px]">
                      ID: {d.toolCallId}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(getSessionPath(d.subagentSessionId));
                      }}
                      className="text-accent hover:underline flex items-center gap-1 font-medium transition-all"
                    >
                      {l.actionNavigate}
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                      </svg>
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>

      {/* Details Area (Split Screen) */}
      <AnimatePresence>
        {selectedDelegation && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ type: "tween", duration: 0.2 }}
            className="flex-1 md:max-w-md lg:max-w-lg border-l border-border bg-surface/10 flex flex-col h-full overflow-hidden"
          >
            <div className="p-4 border-b border-border bg-surface/50 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-text-primary font-display">{l.details}</h3>
                <p className="text-[10px] text-text-secondary font-mono truncate max-w-[200px]">ID: {selectedDelegation.toolCallId}</p>
              </div>
              <button
                onClick={() => setSelectedDelegationId(null)}
                className="p-1 rounded bg-surface hover:bg-surface-hover border border-border text-text-secondary hover:text-text-primary transition-all text-xs flex items-center gap-1 cursor-pointer"
              >
                <span className="md:hidden">{l.closeDetails}</span>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Task Section */}
              <div className="space-y-1">
                <h4 className="text-[10px] font-mono uppercase text-text-secondary font-semibold tracking-wider">{l.thTask}</h4>
                <div className="p-3 bg-surface/40 border border-border/50 rounded-lg text-xs text-text-primary whitespace-pre-wrap leading-relaxed">
                  {selectedDelegation.task}
                </div>
              </div>

              {/* Status & Timing */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-2.5 bg-surface/30 border border-border/30 rounded-lg flex flex-col gap-0.5">
                  <span className="text-[9px] font-mono text-text-secondary uppercase">{l.thStatus}</span>
                  <span className="font-semibold text-text-primary uppercase tracking-wider text-[10px]">{selectedDelegation.status}</span>
                </div>
                <div className="p-2.5 bg-surface/30 border border-border/30 rounded-lg flex flex-col gap-0.5">
                  <span className="text-[9px] font-mono text-text-secondary uppercase">{l.thStarted}</span>
                  <span className="font-mono text-text-primary text-[10px]">
                    {selectedDelegation.startedAt ? new Date(selectedDelegation.startedAt).toLocaleTimeString() : "-"}
                  </span>
                </div>
              </div>

              {/* Result Details */}
              {selectedDelegation.result ? (
                <div className="space-y-4 border-t border-border/30 pt-4 animate-fade-in">
                  {/* Executive Summary */}
                  {selectedDelegation.result.executive_summary && (
                    <div className="space-y-1">
                      <h4 className="text-[10px] font-mono uppercase text-text-secondary font-semibold tracking-wider">{l.executiveSummary}</h4>
                      <div className="p-3 bg-surface/40 border border-border/50 rounded-lg text-xs text-text-primary leading-relaxed">
                        {selectedDelegation.result.executive_summary}
                      </div>
                    </div>
                  )}

                  {/* Artifacts */}
                  {selectedDelegation.result.artifacts && (
                    <div className="space-y-1">
                      <h4 className="text-[10px] font-mono uppercase text-text-secondary font-semibold tracking-wider">{l.artifacts}</h4>
                      <div className="p-3 bg-surface/40 border border-border/50 rounded-lg text-xs text-text-primary leading-relaxed">
                        {selectedDelegation.result.artifacts}
                      </div>
                    </div>
                  )}

                  {/* Risks */}
                  {selectedDelegation.result.risks && (
                    <div className="space-y-1">
                      <h4 className="text-[10px] font-mono uppercase text-text-secondary font-semibold tracking-wider">{l.risks}</h4>
                      <div className="p-3 bg-surface/40 border border-border/50 rounded-lg text-xs text-text-primary leading-relaxed">
                        {selectedDelegation.result.risks}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                selectedDelegation.status === "running" && (
                  <div className="flex flex-col items-center justify-center py-12 gap-3 text-text-secondary select-none animate-pulse">
                    <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                    <span className="text-[10px] font-mono tracking-wider">Subagente procesando la tarea...</span>
                  </div>
                )
              )}
            </div>

            {/* View Session Footer Button */}
            <div className="p-4 border-t border-border bg-surface/50">
              <button
                onClick={() => navigate(getSessionPath(selectedDelegation.subagentSessionId))}
                className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded bg-accent text-bg hover:bg-accent-hover active:scale-[0.98] transition-all text-xs font-semibold cursor-pointer"
              >
                {l.actionNavigate}
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
