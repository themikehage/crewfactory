import { useState, useEffect, useRef } from "react";
import { apiFetch } from "@/lib/api";
import { ModelSelector } from "@/components/chat/ModelSelector";
import { useChannel } from "@/hooks/useChannel";
import { ChannelMessageList } from "@/components/channels/ChannelMessageList";
import { useLiterals } from "@/lib";
import { literals as u } from "./LaboratoryPage.literals";
import { ChannelInput } from "@/components/channels/ChannelInput";
import { motion, AnimatePresence } from "framer-motion";
import type { Experiment } from "@/types/laboratory";
import type { AgentDefinition, CreateChannel } from "shared";


interface Props {
  onNavigate?: (path: string) => void;
  selectedExpId: string | null;
  setSelectedExpId: (id: string | null) => void;
  experiments: Experiment[];
  setExperiments: React.Dispatch<React.SetStateAction<Experiment[]>>;
  isEditorOpen: boolean;
  setIsEditorOpen: (open: boolean) => void;
  editingExpId: string | null;
  setEditingExpId: (id: string | null) => void;

  isRunPromptModalOpen: boolean;
  setIsRunPromptModalOpen: (open: boolean) => void;
  runPromptValue: string;
  setRunPromptValue: (val: string) => void;
  setRunningExpId: (id: string | null) => void;
  handleConfirmRun: () => Promise<void>;
  activeVariantTab: "single" | "multiNoLeader" | "multiWithLeader" | "compare";
  setActiveVariantTab: (tab: "single" | "multiNoLeader" | "multiWithLeader" | "compare") => void;
  onJudgeExperiment?: (id: string) => Promise<void>;
}

interface GeneratedTeam {
  agents: AgentDefinition[];
  channel: CreateChannel & { members: { agentId: string; replyMode: string; role: string }[] };
}

interface VariantViewerProps {
  experimentId: string;
  variantKey: "single" | "multiNoLeader" | "multiWithLeader";
  activeSessionId: string | null;
  status: string;
  result: any;
  criteria?: string[];
  expName?: string;
  expDescription?: string;
}

// Judge criteria score bar
function CriteriaBar({ label, score }: { label: string; score: number }) {
  const color = score >= 80 ? "bg-primary" : score >= 60 ? "bg-yellow-400" : "bg-destructive";
  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <span className="text-[11px] text-muted-foreground font-medium truncate max-w-[140px]">{label}</span>
        <span className="text-[11px] font-bold text-foreground">{score}</span>
      </div>
      <div className="h-1.5 bg-background rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}

function VariantViewer({ experimentId, variantKey, activeSessionId, status, result, criteria, expName, expDescription }: VariantViewerProps) {
  const l = useLiterals(u);
  const channelId = `lab_${experimentId}_${variantKey}`;
  const targetChannelId = activeSessionId ? channelId : null;
  const { messages, streamingAgents, sendMessage } = useChannel(targetChannelId, activeSessionId);

  const [registeredAgents, setRegisteredAgents] = useState<any[]>([]);
  useEffect(() => {
    const token = localStorage.getItem("token");
    fetch("/api/agents", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => setRegisteredAgents(data.agents || []))
      .catch(() => {});
  }, []);

  const mentionNames = ["user", ...registeredAgents.map((a) => a.name)];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[560px] min-h-0 bg-card/10 rounded-2xl border border-input/60 overflow-hidden">
      {/* Panel del Chat (70%) */}
      <div className="lg:col-span-2 flex flex-col h-full bg-card/5 min-h-0 border-r border-input/40 relative">
        <div className="absolute inset-0 flex flex-col min-h-0">
          <div className="px-4 py-2.5 border-b border-input/30 bg-card/10 flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-semibold tracking-wide">{l.experimentChat}</span>
            {status === "running" && (
              <span className="flex items-center gap-1.5 text-primary font-bold animate-pulse">
                <span className="w-2 h-2 bg-primary rounded-full animate-ping" />
                Debatiendo en vivo...
              </span>
            )}
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto bg-background/25">
            <ChannelMessageList
              messages={messages}
              streamingAgents={streamingAgents}
              mentionNames={mentionNames}
              sessionId={activeSessionId}
              activeChannelId={channelId}
            />
          </div>
          {activeSessionId && (
            <ChannelInput onSend={sendMessage} />
          )}
        </div>
      </div>

      {/* Panel de Telemetría (30%) */}
      <div className="p-5 flex flex-col bg-card/10 min-h-0 overflow-y-auto text-left justify-between">
        <div className="space-y-6">
          {expName && (
            <div>
              <p className="text-xs font-bold text-foreground leading-snug">{expName}</p>
              {expDescription && (
                <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">{expDescription}</p>
              )}
            </div>
          )}

          {criteria && criteria.length > 0 && (
            <div>
              <h4 className="text-xs uppercase font-bold text-muted-foreground tracking-wider block mb-2">
                Rúbrica de Evaluación
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {criteria.map((c, i) => (
                  <span
                    key={i}
                    className="text-xs px-2.5 py-1 bg-background border border-input rounded-lg text-muted-foreground font-semibold"
                  >
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div>
            <h4 className="text-xs uppercase font-bold text-muted-foreground tracking-wider block mb-2">
              Telemetría y Estado
            </h4>
            <div className="flex items-center justify-between bg-background/50 border border-input/60 rounded-xl p-3.5">
              <span className="text-xs font-semibold text-foreground">{l.runStatus}</span>
              <span
                className={`text-xs px-2 py-0.5 rounded-lg font-mono font-bold uppercase tracking-wider ${
                  status === "completed"
                    ? "bg-primary/10 text-primary border border-primary/20"
                    : status === "running"
                    ? "bg-blue-500/10 text-blue-400 border border-blue-400/20 animate-pulse"
                    : status === "failed"
                    ? "bg-destructive/10 text-destructive border border-error/20"
                    : "bg-background text-muted-foreground border border-input"
                }`}
              >
                {status}
              </span>
            </div>
          </div>

          {result ? (
            <div className="space-y-5">
              {/* Score Matrix */}
              {result.scores && (
                <div className="space-y-3">
                  <h4 className="text-xs uppercase font-bold text-muted-foreground tracking-wider">
                    Evaluaci\u00f3n LLM-Judge
                  </h4>
                  <div className="bg-background/40 border border-input/40 rounded-xl p-4 space-y-4">
                    <div className="flex flex-col items-center py-2">
                      <div className="relative w-20 h-20 flex items-center justify-center rounded-full bg-primary/5 border border-primary/25 shadow-[0_0_15px_rgba(74,222,128,0.05)]">
                        <span className="text-2xl font-black text-primary">{result.scores.globalScore}</span>
                      </div>
                      <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider mt-2.5">
                        Global Score
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-2 border-t border-input/30">
                      <div className="text-center p-2 bg-background/25 rounded-lg border border-input/30">
                        <p className="text-xs text-muted-foreground font-bold uppercase">{l.quality}</p>
                        <p className="text-base font-black text-foreground mt-0.5">{result.scores.taskQuality}</p>
                      </div>
                      <div className="text-center p-2 bg-background/25 rounded-lg border border-input/30">
                        <p className="text-xs text-muted-foreground font-bold uppercase">{l.efficiency}</p>
                        <p className="text-base font-black text-foreground mt-0.5">{result.scores.efficiencyScore}</p>
                      </div>
                    </div>

                    {/* Criteria breakdown */}
                    {result.scores.criteriaScores && Object.keys(result.scores.criteriaScores).length > 0 && (
                      <div className="space-y-2.5 pt-2 border-t border-input/30">
                        <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Por criterio</p>
                        {Object.entries(result.scores.criteriaScores).map(([crit, score]) => (
                          <CriteriaBar key={crit} label={crit} score={score as number} />
                        ))}
                      </div>
                    )}

                    {/* Judge reasoning */}
                    {result.scores.judgeReasoning && (
                      <details className="pt-2 border-t border-input/30">
                        <summary className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider cursor-pointer hover:text-foreground transition-colors">
                          Razonamiento del Judge
                        </summary>
                        <p className="text-[11px] text-muted-foreground leading-relaxed mt-2 italic">
                          {result.scores.judgeReasoning}
                        </p>
                      </details>
                    )}
                  </div>
                </div>
              )}

              {/* Estadísticas */}
              <div className="space-y-3">
                <h4 className="text-xs uppercase font-bold text-muted-foreground tracking-wider">
                  Métricas de Ejecución
                </h4>
                <div className="bg-background/40 border border-input/40 rounded-xl p-3.5 space-y-2.5 text-xs font-mono text-muted-foreground leading-relaxed">
                  <div className="flex justify-between">
                    <span>Duración:</span>
                    <span className="text-foreground font-bold">{(result.durationMs / 1000).toFixed(1)}s</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Tokens entrada:</span>
                    <span className="text-foreground">{result.tokensIn}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Tokens salida:</span>
                    <span className="text-foreground">{result.tokensOut}</span>
                  </div>
                  {result.negotiationRounds !== undefined && (
                    <div className="flex justify-between">
                      <span>Rondas debate:</span>
                      <span className="text-foreground">{result.negotiationRounds}</span>
                    </div>
                  )}
                  {result.escalationsToLeader !== undefined && (
                    <div className="flex justify-between">
                      <span>Escalaciones:</span>
                      <span className="text-foreground">{result.escalationsToLeader}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Mostrar resultado final textual (o error) */}
              {result.finalOutput && (
                <div className="space-y-2">
                  <h4 className="text-xs uppercase font-bold text-muted-foreground tracking-wider">
                    {result.status === "failed" ? "{l.errorDetail}" : "{l.finalResult}"}
                  </h4>
                  <pre className={`text-xs border rounded-xl p-3 max-h-32 overflow-y-auto whitespace-pre-wrap font-mono text-left leading-relaxed ${
                    result.status === "failed" 
                      ? "bg-destructive/5 text-destructive border-error/20" 
                      : "bg-background/30 text-muted-foreground border-input"
                  }`}>
                    {result.finalOutput}
                  </pre>
                </div>
              )}
            </div>
          ) : (
            status === "running" ? (
              <div className="flex-1 flex flex-col items-center justify-center py-16 text-center text-xs text-muted-foreground space-y-3">
                <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
                <span className="font-semibold tracking-wide text-primary">Debate en progreso...</span>
                <span className="text-xs text-muted-foreground max-w-[200px]">
                  Los agentes están analizando y colaborando en tiempo real. Seguí la conversación a la izquierda.
                </span>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center py-16 text-center text-xs text-muted-foreground italic bg-background/20 rounded-xl border border-dashed border-input/60">
                Esperando el inicio de la corrida...
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}

type VariantKey = "single" | "multiNoLeader" | "multiWithLeader";
const VARIANT_LABELS: Record<VariantKey, string> = {
  single: "Baseline",
  multiNoLeader: "H. Horizontal",
  multiWithLeader: "H. Jer\u00e1rquico",
};

function JudgeReport({
  exp,
  onJudge,
  isJudging,
  onNavigate,
}: {
  exp: Experiment;
  onJudge?: () => void;
  isJudging: boolean;
  onNavigate: (tab: VariantKey) => void;
}) {
  const variantKeys: VariantKey[] = ["single", "multiNoLeader", "multiWithLeader"];
  const hasScores = variantKeys.some((k) => !!exp.variants[k]?.result?.scores);

  const winner = hasScores
    ? variantKeys.reduce((best, k) => {
        const s = exp.variants[k]?.result?.scores?.globalScore ?? -1;
        const b = exp.variants[best]?.result?.scores?.globalScore ?? -1;
        return s > b ? k : best;
      }, variantKeys[0])
    : null;

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-foreground">Reporte Comparativo</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Evaluaci\u00f3n del LLM-Judge sobre las tres variantes</p>
        </div>
        <button
          onClick={onJudge}
          disabled={isJudging}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-primary/10 border border-primary/30 text-primary rounded-lg hover:bg-primary/20 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isJudging ? (
            <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          ) : (
            <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
            </svg>
          )}
          {isJudging ? "Evaluando..." : "Re-evaluar"}
        </button>
      </div>

      {/* Score Cards */}
      <div className="grid grid-cols-3 gap-4">
        {variantKeys.map((k) => {
          const result = exp.variants[k]?.result;
          const scores = result?.scores;
          const isWinner = winner === k && hasScores;
          return (
            <button
              key={k}
              onClick={() => onNavigate(k)}
              className={`text-left p-4 rounded-2xl border transition-all cursor-pointer group ${
                isWinner
                  ? "bg-primary/5 border-primary/40 shadow-[0_0_20px_rgba(74,222,128,0.08)]"
                  : "bg-card/20 border-input/60 hover:bg-card/40 hover:border-input"
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="text-xs font-bold text-foreground">{VARIANT_LABELS[k]}</p>
                  {result && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-bold uppercase mt-1 inline-block ${
                      result.status === "completed"
                        ? "bg-primary/10 text-primary"
                        : "bg-destructive/10 text-destructive"
                    }`}>
                      {result.status}
                    </span>
                  )}
                </div>
                {isWinner && (
                  <span className="text-base" title="Ganadora">🏆</span>
                )}
              </div>

              {scores ? (
                <>
                  <div className="flex items-end gap-1 mb-3">
                    <span className="text-3xl font-black text-primary">{scores.globalScore}</span>
                    <span className="text-xs text-muted-foreground mb-1">/100</span>
                  </div>
                  <div className="space-y-1.5 text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Calidad</span>
                      <span className="font-bold text-foreground">{scores.taskQuality}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Eficiencia</span>
                      <span className="font-bold text-foreground">{scores.efficiencyScore}</span>
                    </div>
                    {scores.negotiationScore !== undefined && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Negociaci\u00f3n</span>
                        <span className="font-bold text-foreground">{scores.negotiationScore}</span>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-xs text-muted-foreground italic mt-2">Sin evaluaci\u00f3n</p>
              )}
            </button>
          );
        })}
      </div>

      {/* Criteria breakdown table */}
      {hasScores && (() => {
        const allCriteria = Array.from(
          new Set(variantKeys.flatMap((k) => Object.keys(exp.variants[k]?.result?.scores?.criteriaScores ?? {})))
        );
        if (allCriteria.length === 0) return null;
        return (
          <div className="space-y-3">
            <h3 className="text-xs uppercase font-bold text-muted-foreground tracking-wider">Desglose por Criterio</h3>
            <div className="bg-card/20 border border-input/60 rounded-2xl overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-input/40 bg-card/30">
                    <th className="text-left px-4 py-2.5 text-muted-foreground font-bold uppercase tracking-wider">Criterio</th>
                    {variantKeys.map((k) => (
                      <th key={k} className="text-center px-3 py-2.5 text-muted-foreground font-bold uppercase tracking-wider">
                        {VARIANT_LABELS[k]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {allCriteria.map((crit) => (
                    <tr key={crit} className="border-b border-input/20 last:border-0 hover:bg-card/20 transition-colors">
                      <td className="px-4 py-2.5 text-muted-foreground font-medium">{crit}</td>
                      {variantKeys.map((k) => {
                        const s = exp.variants[k]?.result?.scores?.criteriaScores?.[crit];
                        const isTop = s !== undefined && variantKeys.every((ok) => ok === k || (exp.variants[ok]?.result?.scores?.criteriaScores?.[crit] ?? -1) <= s);
                        return (
                          <td key={k} className="text-center px-3 py-2.5">
                            {s !== undefined ? (
                              <span className={`font-bold ${
                                isTop ? "text-primary" : "text-foreground"
                              }`}>{s}</span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

      {/* Reasoning summaries */}
      {hasScores && (
        <div className="space-y-3">
          <h3 className="text-xs uppercase font-bold text-muted-foreground tracking-wider">Razonamiento del Judge</h3>
          <div className="space-y-2">
            {variantKeys.map((k) => {
              const reasoning = exp.variants[k]?.result?.scores?.judgeReasoning;
              if (!reasoning) return null;
              return (
                <div key={k} className="bg-card/20 border border-input/40 rounded-xl p-4">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">{VARIANT_LABELS[k]}</p>
                  <p className="text-xs text-muted-foreground leading-relaxed italic">{reasoning}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!hasScores && !isJudging && (
        <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
          <svg className="w-10 h-10 text-muted-foreground/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-xs text-muted-foreground">No hay evaluaci\u00f3n disponible todav\u00eda.</p>
          <p className="text-[11px] text-muted-foreground/60">Presion\u00e1 Re-evaluar para iniciar el juicio LLM.</p>
        </div>
      )}
    </div>
  );
}

export function LaboratoryPage({
  onNavigate: _onNavigate,
  selectedExpId,
  setSelectedExpId,
  experiments,
  setExperiments,
  isEditorOpen,
  setIsEditorOpen,
  editingExpId,
  setEditingExpId: _setEditingExpId,
  isRunPromptModalOpen,
  setIsRunPromptModalOpen,
  runPromptValue,
  setRunPromptValue,
  setRunningExpId,
  handleConfirmRun,
  activeVariantTab,
  setActiveVariantTab,
  onJudgeExperiment,
}: Props) {
  const l = useLiterals(u);
  // Model Selector State (for AI Generator)
  const [selectedModel, setSelectedModel] = useState("anthropic/claude-3-5-sonnet");

  // AI Generator State
  const [generatorPrompt, setGeneratorPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [editableTeam, setEditableTeam] = useState<GeneratedTeam | null>(null);
  const [instantiating, setInstantiating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [instantiationSuccess, setInstantiationSuccess] = useState(false);

  // Experiment Editor State (for Scratch Mode/Edit)
  const [editorName, setEditorName] = useState("");
  const [editorPrompt, setEditorPrompt] = useState("");
  const [editorCriteria, setEditorCriteria] = useState<string[]>(["{l.workQuality}", "{l.efficiency}", "{l.negotiation}"]);
  const [newCriterion, setNewCriterion] = useState("");
  const [editorVariants, setEditorVariants] = useState<any | null>(null);

  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastAutoSwitchedVariantRef = useRef<"single" | "multiNoLeader" | "multiWithLeader" | null>(null);
  const [isJudging, setIsJudging] = useState(false);

  const activeExp = experiments.find((e) => e.id === selectedExpId) || null;

  useEffect(() => {
    if (isEditorOpen && editingExpId) {
      const exp = experiments.find((e) => e.id === editingExpId);
      if (exp) {
        setEditorName(exp.name);
        setEditorPrompt(exp.taskPrompt);
        setEditorCriteria(exp.judge?.criteria || ["Calidad", "Eficiencia"]);
        setEditorVariants(null);
      }
    }
  }, [isEditorOpen, editingExpId, experiments]);

  // Load user default model
  useEffect(() => {
    const stored = localStorage.getItem("pi-selected-model");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setSelectedModel(`${parsed.provider}/${parsed.modelId}`);
      } catch {}
    }
    apiFetch("/api/experiments/default-model")
      .then((r) => r.json())
      .then((d) => {
        if (d.model) setSelectedModel(d.model);
      })
      .catch(() => {});
  }, []);

  // Poll running experiment status
  useEffect(() => {
    if (activeExp && activeExp.status === "running") {
      pollTimerRef.current = setInterval(async () => {
        try {
          const res = await apiFetch(`/api/experiments/${activeExp.id}`);
          if (res.ok) {
            const data = await res.json();
            const updated = data.experiment as Experiment;
            setExperiments((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
            if (updated.status !== "running" && pollTimerRef.current) {
              clearInterval(pollTimerRef.current);
            }
          }
        } catch {}
      }, 2000);
    } else {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
      }
    }
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [activeExp, setExperiments]);

  // Reset variant tab on selected experiment change
  useEffect(() => {
    setActiveVariantTab("single");
    lastAutoSwitchedVariantRef.current = null;
  }, [selectedExpId]);

  // Automatically switch tab to currently running variant
  useEffect(() => {
    if (activeExp && activeExp.status === "running") {
      const runningVariant = (["single", "multiNoLeader", "multiWithLeader"] as const).find((vKey) => {
        const run = activeExp.variants?.[vKey];
        return run?.activeSessionId && !run?.result;
      });
      if (runningVariant && lastAutoSwitchedVariantRef.current !== runningVariant) {
        lastAutoSwitchedVariantRef.current = runningVariant;
        setActiveVariantTab(runningVariant);
      }
    } else {
      lastAutoSwitchedVariantRef.current = null;
    }
  }, [activeExp]);

  const handleGenerateTeam = async () => {
    if (!generatorPrompt.trim()) return;
    setGenerating(true);
    setGenError(null);
    setEditableTeam(null);
    setInstantiationSuccess(false);

    try {
      const res = await apiFetch("/api/experiments/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: generatorPrompt, model: selectedModel }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Fallo en la generación");
      }

      const data = (await res.json()) as GeneratedTeam;
      
      // Aplicar regla del lead por defecto antes de guardar
      if (data.channel && data.channel.members) {
        data.channel.members = data.channel.members.map((m) => {
          if (m.role === "lead") {
            return { ...m, replyMode: "user-only" };
          }
          return m;
        });
      }
      if (data.channel && !data.channel.context) {
        data.channel.context = [];
      }

      setEditableTeam(data);
      setEditorName(`Experimento: ${data.channel.name}`);
      setEditorCriteria(["{l.workQuality}", "{l.efficiency}", "{l.negotiation}"]);
    } catch (e: any) {
      setGenError(e.message || "Error al conectar con la IA de generación.");
    } finally {
      setGenerating(false);
    }
  };

  const handleInstantiateTeam = async () => {
    if (!editableTeam) return;
    setInstantiating(true);
    setGenError(null);

    // Validar y forzar que el lead tenga replyMode "user-only" antes de enviar
    const sanitizedMembers = editableTeam.channel.members.map((m) => {
      if (m.role === "lead") {
        return { ...m, replyMode: "user-only" };
      }
      return m;
    });

    const sanitizedTeam = {
      ...editableTeam,
      channel: {
        ...editableTeam.channel,
        members: sanitizedMembers,
      },
    };

    try {
      const res = await apiFetch("/api/experiments/instantiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agents: sanitizedTeam.agents,
          channel: sanitizedTeam.channel,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Fallo al instanciar el equipo");
      }

      setInstantiationSuccess(true);
      window.dispatchEvent(new CustomEvent("entity-updated", { detail: { type: "all" } }));
    } catch (e: any) {
      setGenError(e.message || "Error al registrar agentes/canal en el workspace.");
    } finally {
      setInstantiating(false);
    }
  };

  const handleSaveExperiment = async () => {
    if (!editorName.trim() || !editorPrompt.trim()) return;

    const isEdit = !!editingExpId;
    const body = {
      name: editorName,
      taskPrompt: editorPrompt,
      criteria: editorCriteria,
      variants: editorVariants,
    };

    try {
      const res = await apiFetch(
        isEdit ? `/api/experiments/${editingExpId}` : "/api/experiments",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );

      if (res.ok) {
        const data = await res.json();
        const saved = data.experiment as Experiment;
        if (isEdit) {
          setExperiments((prev) => prev.map((e) => (e.id === saved.id ? saved : e)));
        } else {
          setExperiments((prev) => [saved, ...prev]);
        }
        setSelectedExpId(saved.id);
        setIsEditorOpen(false);
      }
    } catch (e) {
      console.error("{l.saveExperimentError}", e);
    }
  };

  const handleSaveExperimentDirect = async () => {
    if (!editorName.trim() || !generatorPrompt.trim() || !editableTeam) return;

    const singleAgents = [
      {
        id: "baseline",
        name: editableTeam.agents[0]?.name || "{l.generalAgent}",
        role: editableTeam.agents[0]?.role || "{l.generalAssistant}",
        systemPrompt: editableTeam.agents[0]?.systemPrompt || "Eres un asistente general de IA. Responde de forma concisa.",
        model: editableTeam.agents[0]?.model || "anthropic/claude-3-5-sonnet",
      }
    ];

    const multiAgents = editableTeam.agents.map((ag) => {
      const mInfo = editableTeam.channel.members.find(m => m.agentId === ag.id);
      return {
        id: ag.id,
        name: ag.name,
        role: ag.role,
        systemPrompt: ag.systemPrompt,
        model: ag.model || "anthropic/claude-3-5-sonnet",
        leader: mInfo?.role === "lead"
      };
    });

    const vars = {
      single: { type: "single", agents: singleAgents },
      multiNoLeader: { type: "multi_no_leader", agents: multiAgents.filter(a => !a.leader) },
      multiWithLeader: { type: "multi_with_leader", agents: multiAgents }
    };

    const body = {
      name: editorName,
      taskPrompt: generatorPrompt,
      criteria: editorCriteria,
      autoEvaluate: true,
      variants: vars
    };

    try {
      const res = await apiFetch("/api/experiments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const data = await res.json();
        const saved = data.experiment as Experiment;
        setExperiments((prev) => [saved, ...prev]);
        setSelectedExpId(saved.id);
      }
    } catch (e) {
      console.error("{l.saveExperimentError}", e);
    }
  };

  const handleAddCriterion = () => {
    if (newCriterion.trim() && !editorCriteria.includes(newCriterion.trim())) {
      setEditorCriteria([...editorCriteria, newCriterion.trim()]);
      setNewCriterion("");
    }
  };

  const handleRemoveCriterion = (idx: number) => {
    setEditorCriteria(editorCriteria.filter((_, i) => i !== idx));
  };

  // --- Handlers de Edición de Equipo ---
  const handleUpdateChannelField = (field: keyof CreateChannel, value: any) => {
    if (!editableTeam) return;
    setEditableTeam({
      ...editableTeam,
      channel: {
        ...editableTeam.channel,
        [field]: value
      }
    });
  };

  const handleAddContextItem = () => {
    if (!editableTeam) return;
    const updatedContext = [...(editableTeam.channel.context || []), { key: "", value: "" }];
    setEditableTeam({
      ...editableTeam,
      channel: {
        ...editableTeam.channel,
        context: updatedContext
      }
    });
  };

  const handleUpdateContextItem = (index: number, key: string, value: string) => {
    if (!editableTeam) return;
    const updatedContext = [...(editableTeam.channel.context || [])];
    updatedContext[index] = { key, value };
    setEditableTeam({
      ...editableTeam,
      channel: {
        ...editableTeam.channel,
        context: updatedContext
      }
    });
  };

  const handleRemoveContextItem = (index: number) => {
    if (!editableTeam) return;
    const updatedContext = (editableTeam.channel.context || []).filter((_, i) => i !== index);
    setEditableTeam({
      ...editableTeam,
      channel: {
        ...editableTeam.channel,
        context: updatedContext
      }
    });
  };

  const handleUpdateAgentId = (oldId: string, newId: string) => {
    if (!editableTeam) return;
    const sanitizedId = newId.toLowerCase().replace(/[^a-z0-9-]/g, "-");

    const updatedAgents = editableTeam.agents.map((ag) =>
      ag.id === oldId ? { ...ag, id: sanitizedId } : ag
    );

    const updatedMembers = editableTeam.channel.members.map((m) =>
      m.agentId === oldId ? { ...m, agentId: sanitizedId } : m
    );

    setEditableTeam({
      ...editableTeam,
      agents: updatedAgents,
      channel: {
        ...editableTeam.channel,
        members: updatedMembers
      }
    });
  };

  const handleUpdateAgentField = (agentId: string, field: keyof AgentDefinition, value: any) => {
    if (!editableTeam) return;
    const updatedAgents = editableTeam.agents.map((ag) =>
      ag.id === agentId ? { ...ag, [field]: value } : ag
    );
    setEditableTeam({
      ...editableTeam,
      agents: updatedAgents
    });
  };

  const handleUpdateMemberRole = (agentId: string, newRole: string) => {
    if (!editableTeam) return;
    const updatedMembers = editableTeam.channel.members.map((m) => {
      if (m.agentId === agentId) {
        return {
          ...m,
          role: newRole,
          // Si es lead, forzamos user-only
          replyMode: newRole === "lead" ? "user-only" : m.replyMode
        };
      }
      // Si asignamos lead a uno, los demás que eran lead pasan a member
      if (newRole === "lead" && m.role === "lead") {
        return { ...m, role: "member" };
      }
      return m;
    });

    setEditableTeam({
      ...editableTeam,
      channel: {
        ...editableTeam.channel,
        members: updatedMembers
      }
    });
  };

  const handleUpdateMemberReplyMode = (agentId: string, newReplyMode: string) => {
    if (!editableTeam) return;
    const updatedMembers = editableTeam.channel.members.map((m) => {
      if (m.agentId === agentId) {
        return { ...m, replyMode: newReplyMode };
      }
      return m;
    });
    setEditableTeam({
      ...editableTeam,
      channel: {
        ...editableTeam.channel,
        members: updatedMembers
      }
    });
  };

  const handleAddAgent = () => {
    if (!editableTeam) return;
    const newAgentId = `agent-${Date.now().toString(36)}`;
    const newAgent: AgentDefinition = {
      id: newAgentId,
      name: "{l.newAgent}",
      role: "assistant",
      systemPrompt: "Eres un agente colaborador en este canal. Responde de forma concisa y ayuda a resolver la tarea.",
      model: selectedModel || "anthropic/claude-3-5-sonnet",
      skills: []
    };
    const newMember = {
      agentId: newAgentId,
      replyMode: "broadcast",
      role: "member"
    };
    setEditableTeam({
      ...editableTeam,
      agents: [...editableTeam.agents, newAgent],
      channel: {
        ...editableTeam.channel,
        members: [...editableTeam.channel.members, newMember]
      }
    });
  };

  const handleRemoveAgent = (agentId: string) => {
    if (!editableTeam) return;
    const updatedAgents = editableTeam.agents.filter((a) => a.id !== agentId);
    let updatedMembers = editableTeam.channel.members.filter((m) => m.agentId !== agentId);
    
    // Si borramos al lead, promovamos al primer agente restante a lead
    const wasLead = editableTeam.channel.members.find((m) => m.agentId === agentId)?.role === "lead";
    if (wasLead && updatedMembers.length > 0) {
      updatedMembers = updatedMembers.map((m, idx) => {
        if (idx === 0) {
          return { ...m, role: "lead", replyMode: "user-only" };
        }
        return m;
      });
    }

    setEditableTeam({
      ...editableTeam,
      agents: updatedAgents,
      channel: {
        ...editableTeam.channel,
        members: updatedMembers
      }
    });
  };

  return (
    <div className="flex h-full min-h-0 bg-background text-foreground font-body">
      {/* Area Principal de Contenido (Abarca todo el ancho de la página al quitar el sidebar) */}
      <div className="flex-1 min-w-0 bg-background flex flex-col p-6 overflow-y-auto">
        <AnimatePresence mode="wait">
          {!selectedExpId ? (
            <motion.div
              key="generator"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6 max-w-5xl mx-auto w-full"
            >
              {/* Card Header del Generador */}
              <div className="bg-card border border-input rounded-2xl p-6">
                <div className="flex items-center gap-2 mb-2">
                  <span className="p-2 bg-primary/10 rounded-xl">
                    <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M13 10V3L4 14h7v7l9-11h-7z"
                      />
                    </svg>
                  </span>
                  <div>
                    <h1 className="text-lg font-bold">Generá tu Equipo con IA</h1>
                    <p className="text-xs text-muted-foreground">
                      Ingresá una descripción y la IA configurará los Agentes Programáticos y el Canal correspondiente.
                    </p>
                  </div>
                </div>

                <div className="mt-4 space-y-4">
                  <textarea
                    value={generatorPrompt}
                    onChange={(e) => setGeneratorPrompt(e.target.value)}
                    placeholder="Ejemplo: Necesito un equipo de redactores publicitarios. Quiero un agente especialista en copy persuasivo, un corrector ortográfico y un coordinador que apruebe y decida."
                    rows={4}
                    className="w-full bg-background border border-input rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary transition-colors font-body text-foreground"
                  />

                  {genError && (
                    <div className="p-3 bg-destructive/10 border border-error/20 text-destructive rounded-xl text-xs flex items-center gap-2">
                      <span className="font-bold">Error:</span> {genError}
                    </div>
                  )}

                  {instantiationSuccess && (
                    <div className="p-3 bg-primary/10 border border-primary/20 text-primary rounded-xl text-xs flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                      </svg>
                      <span>¡Equipo instanciado y cargado con éxito en el workspace!</span>
                    </div>
                  )}

                  {/* Selector de Modelo al lado del botón de generar */}
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mt-4 bg-background/40 p-3 rounded-xl border border-input/50">
                    <div className="flex items-center gap-2.5">
                      <span className="text-xs uppercase font-bold text-muted-foreground tracking-wider font-mono">
                        Modelo Generador:
                      </span>
                      <ModelSelector
                        sessionId="laboratory"
                        value={selectedModel}
                        onChange={setSelectedModel}
                      />
                    </div>
                    <button
                      onClick={handleGenerateTeam}
                      disabled={generating || !generatorPrompt.trim()}
                      className="w-full sm:w-auto px-4 py-2 bg-primary text-background hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-xs font-bold transition-all shadow flex items-center justify-center gap-2 cursor-pointer"
                    >
                      {generating ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-bg border-t-transparent rounded-full animate-spin" />
                          <span>Generando...</span>
                        </>
                      ) : (
                        <span>Generar con IA</span>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Resultado del Generador (Editable) */}
              {editableTeam && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="space-y-6"
                >
                  <div className="flex justify-between items-center">
                    <h2 className="text-sm font-bold text-foreground tracking-wide uppercase">Propuesta Generada (Editable)</h2>
                    <div className="flex gap-2">
                      <button
                        onClick={handleSaveExperimentDirect}
                        disabled={editableTeam.agents.length < 3}
                        className="px-4 py-1.5 bg-card hover:bg-card-hover border border-input text-foreground disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-xs font-bold transition-all cursor-pointer"
                      >
                        Crear Experimento
                      </button>
                      <button
                        onClick={handleInstantiateTeam}
                        disabled={instantiating || editableTeam.agents.length < 3}
                        className="px-4 py-1.5 bg-primary text-background hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-xs font-bold transition-all shadow flex items-center gap-2 cursor-pointer"
                      >
                        {instantiating ? (
                          <>
                            <div className="w-3.5 h-3.5 border-2 border-bg border-t-transparent rounded-full animate-spin" />
                            <span>Instanciando...</span>
                          </>
                        ) : (
                          <span>Instanciar Equipo Completo</span>
                        )}
                      </button>
                    </div>
                  </div>

                  {editableTeam.agents.length < 3 && (
                    <div className="p-4 bg-warning/10 border border-warning/20 rounded-2xl flex flex-col gap-1 text-warning text-xs text-left">
                      <div className="flex items-center gap-2 font-bold text-yellow-400">
                        <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        <span>Regla de Negocio: Mínimo de Agentes</span>
                      </div>
                      <p className="text-muted-foreground leading-relaxed">
                        Se requiere un mínimo de <strong>3 agentes</strong> para poder ejecutar los tracks colaborativos (Colaboración Horizontal y Colaboración Jerárquica). Agregá más agentes al equipo para cumplir con esta regla.
                      </p>
                    </div>
                  )}

                  {/* Creador de Experimento Directo (Unificado) */}
                  <div className="bg-card border border-input rounded-2xl p-5 space-y-4 text-left">
                    <div className="flex items-center gap-2 pb-2 border-b border-input/50">
                      <span className="p-1.5 bg-primary/10 rounded-lg text-primary">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                      </span>
                      <h3 className="font-bold text-xs uppercase tracking-wider text-foreground">Configuración del Experimento</h3>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs uppercase font-bold text-muted-foreground tracking-wider block mb-1">
                          Nombre del Experimento
                        </label>
                        <input
                          type="text"
                          value={editorName}
                          onChange={(e) => setEditorName(e.target.value)}
                          className="w-full bg-background border border-input rounded-xl px-3 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary font-semibold"
                          placeholder="Nombre del experimento..."
                        />
                      </div>
                      <div>
                        <label className="text-xs uppercase font-bold text-muted-foreground tracking-wider block mb-1">
                          Criterios de Evaluación del LLM-Judge
                        </label>
                        <div className="flex gap-1.5 mb-2">
                          <input
                            type="text"
                            value={newCriterion}
                            onChange={(e) => setNewCriterion(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                handleAddCriterion();
                              }
                            }}
                            placeholder="Agregar criterio..."
                            className="flex-1 bg-background border border-input rounded-lg px-2.5 py-1 text-xs focus:outline-none focus:border-primary text-foreground"
                          />
                          <button
                            onClick={handleAddCriterion}
                            className="px-2.5 py-1 bg-background border border-input hover:bg-card-hover rounded-lg text-xs font-bold cursor-pointer"
                          >
                            +
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {editorCriteria.map((c, i) => (
                            <span
                              key={i}
                              className="text-xs px-2 py-0.5 bg-background border border-input rounded text-muted-foreground flex items-center gap-1.5"
                            >
                              <span>{c}</span>
                              <button
                                onClick={() => handleRemoveCriterion(i)}
                                className="text-destructive hover:text-destructive/85 font-bold cursor-pointer"
                              >
                                ×
                              </button>
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Formulario de Canal Editable */}
                    <div className="bg-card border border-input rounded-2xl p-5 lg:col-span-1 flex flex-col justify-between">
                      <div className="space-y-4">
                        <div className="flex items-center gap-2 mb-1 border-b border-input/50 pb-2">
                          <span className="p-1.5 bg-blue-500/10 rounded-lg text-blue-400">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth="2"
                                d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z"
                              />
                            </svg>
                          </span>
                          <h3 className="font-bold text-xs text-foreground uppercase tracking-wider">Ajustes del Canal</h3>
                        </div>

                        <div>
                          <label className="text-xs uppercase font-bold text-muted-foreground tracking-wider block mb-1">
                            Nombre del Canal
                          </label>
                          <input
                            type="text"
                            value={editableTeam.channel.name}
                            onChange={(e) => handleUpdateChannelField("name", e.target.value)}
                            className="w-full bg-background border border-input rounded-xl px-3 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary font-semibold"
                          />
                        </div>

                        <div>
                          <label className="text-xs uppercase font-bold text-muted-foreground tracking-wider block mb-1">
                            Descripción
                          </label>
                          <textarea
                            value={editableTeam.channel.description || ""}
                            onChange={(e) => handleUpdateChannelField("description", e.target.value)}
                            rows={3}
                            className="w-full bg-background border border-input rounded-xl px-3 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary leading-relaxed"
                          />
                        </div>

                        <div className="flex justify-between items-center text-xs">
                          <span className="text-muted-foreground font-medium">Límite de debate:</span>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              min={1}
                              max={20}
                              value={editableTeam.channel.maxChainDepth || 5}
                              onChange={(e) => handleUpdateChannelField("maxChainDepth", parseInt(e.target.value) || 5)}
                              className="w-14 bg-background border border-input rounded-lg px-2 py-0.5 text-xs font-mono text-foreground focus:outline-none focus:border-primary text-center"
                            />
                            <span className="text-muted-foreground">rondas</span>
                          </div>
                        </div>

                        {/* Variables de Contexto KV del Canal */}
                        <div className="border-t border-input pt-4 mt-2 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs uppercase font-bold text-muted-foreground tracking-wider font-mono">
                              Contexto KV
                            </span>
                            <button
                              onClick={handleAddContextItem}
                              className="text-xs text-primary hover:underline font-bold cursor-pointer"
                            >
                              + Agregar
                            </button>
                          </div>
                          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                            {(editableTeam.channel.context || []).map((ctx, idx) => (
                              <div key={idx} className="flex items-center gap-1">
                                <input
                                  type="text"
                                  placeholder="Clave"
                                  value={ctx.key}
                                  onChange={(e) => handleUpdateContextItem(idx, e.target.value, ctx.value)}
                                  className="flex-1 min-w-0 bg-background border border-input rounded px-2 py-0.5 text-xs text-foreground font-mono focus:outline-none focus:border-primary"
                                />
                                <input
                                  type="text"
                                  placeholder="Valor"
                                  value={ctx.value}
                                  onChange={(e) => handleUpdateContextItem(idx, ctx.key, e.target.value)}
                                  className="flex-1 min-w-0 bg-background border border-input rounded px-2 py-0.5 text-xs text-foreground focus:outline-none focus:border-primary"
                                />
                                <button
                                  onClick={() => handleRemoveContextItem(idx)}
                                  className="text-destructive hover:text-destructive/80 font-bold px-1.5 cursor-pointer text-xs"
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                            {(editableTeam.channel.context || []).length === 0 && (
                              <span className="text-xs text-muted-foreground block italic py-2">
                                Sin variables de contexto
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Formulario de Agentes Editables */}
                    <div className="lg:col-span-2 space-y-4">
                      {editableTeam.agents.map((ag) => {
                        const mInfo = editableTeam.channel.members.find((m) => m.agentId === ag.id);
                        return (
                          <div
                            key={ag.id}
                            className="bg-card border border-input rounded-2xl p-5 flex flex-col gap-4 hover:border-primary/10 transition-colors"
                          >
                            <div className="flex flex-col sm:flex-row gap-4 justify-between items-start border-b border-input/40 pb-3">
                              {/* Identificación del Agente */}
                              <div className="grid grid-cols-2 gap-3 flex-1 w-full">
                                <div>
                                  <label className="text-xs uppercase font-bold text-muted-foreground tracking-wider block mb-1">
                                    Nombre del Agente
                                  </label>
                                  <input
                                    type="text"
                                    value={ag.name}
                                    onChange={(e) => handleUpdateAgentField(ag.id, "name", e.target.value)}
                                    className="w-full bg-background border border-input rounded-xl px-3 py-1 text-xs text-foreground focus:outline-none focus:border-primary font-semibold"
                                  />
                                </div>
                                <div>
                                  <label className="text-xs uppercase font-bold text-muted-foreground tracking-wider block mb-1">
                                    ID (Kebab-case)
                                  </label>
                                  <input
                                    type="text"
                                    value={ag.id}
                                    onChange={(e) => handleUpdateAgentId(ag.id, e.target.value)}
                                    className="w-full bg-background border border-input rounded-xl px-3 py-1 text-xs text-foreground focus:outline-none focus:border-primary font-mono"
                                  />
                                </div>
                              </div>

                              {/* Roles y Modos del Miembro del Canal */}
                              {mInfo && (
                                <div className="flex gap-2 w-full sm:w-auto items-end">
                                  <div className="flex-1 sm:flex-initial">
                                    <label className="text-xs uppercase font-bold text-muted-foreground tracking-wider block mb-1">
                                      Rol Canal
                                    </label>
                                    <select
                                      value={mInfo.role || "member"}
                                      onChange={(e) => handleUpdateMemberRole(ag.id, e.target.value)}
                                      className="w-full bg-background border border-input rounded-xl px-2.5 py-1 text-xs text-foreground focus:outline-none focus:border-primary cursor-pointer"
                                    >
                                      <option value="member">Member</option>
                                      <option value="lead">Lead</option>
                                      <option value="senior">Senior</option>
                                      <option value="observer">Observer</option>
                                    </select>
                                  </div>

                                  <div className="flex-1 sm:flex-initial">
                                    <label className="text-xs uppercase font-bold text-muted-foreground tracking-wider block mb-1">
                                      Reply Mode
                                    </label>
                                    <select
                                      value={mInfo.replyMode}
                                      disabled={mInfo.role === "lead"}
                                      onChange={(e) => handleUpdateMemberReplyMode(ag.id, e.target.value)}
                                      className="w-full bg-background border border-input rounded-xl px-2.5 py-1 text-xs text-foreground focus:outline-none focus:border-primary disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
                                    >
                                      <option value="mention-only">Mention Only</option>
                                      <option value="broadcast">Broadcast</option>
                                      <option value="targeted">Targeted</option>
                                      <option value="user-only">User Only</option>
                                    </select>
                                  </div>

                                  <button
                                    onClick={() => handleRemoveAgent(ag.id)}
                                    className="p-2 bg-destructive/10 hover:bg-destructive/20 border border-error/20 hover:border-error/45 text-destructive rounded-xl text-xs font-bold transition-all cursor-pointer h-[30px] flex items-center justify-center aspect-square"
                                    title="Remover Agente"
                                  >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                  </button>
                                </div>
                              )}
                            </div>

                            {/* Rol del Agente e Instrucciones */}
                            <div className="space-y-3">
                              <div>
                                <label className="text-xs uppercase font-bold text-muted-foreground tracking-wider block mb-1">
                                  Propósito (Role)
                                </label>
                                <input
                                  type="text"
                                  value={ag.role}
                                  onChange={(e) => handleUpdateAgentField(ag.id, "role", e.target.value)}
                                  className="w-full bg-background border border-input rounded-xl px-3 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary font-medium font-mono"
                                />
                              </div>

                              <div>
                                <label className="text-xs uppercase font-bold text-muted-foreground tracking-wider block mb-1">
                                  System Prompt (Instrucciones)
                                </label>
                                <textarea
                                  value={ag.systemPrompt}
                                  onChange={(e) => handleUpdateAgentField(ag.id, "systemPrompt", e.target.value)}
                                  rows={4}
                                  className="w-full bg-background border border-input rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none focus:border-primary leading-relaxed font-mono"
                                />
                              </div>

                              {/* Modelo del Agente */}
                              <div className="flex items-center gap-2 bg-background/30 px-3 py-2 rounded-xl border border-input/30">
                                <span className="text-xs uppercase font-bold text-muted-foreground tracking-wider font-mono">
                                  Modelo del Agente:
                                </span>
                                <ModelSelector
                                  sessionId={null}
                                  value={ag.model || "anthropic/claude-3-5-sonnet"}
                                  onChange={(modelId) => handleUpdateAgentField(ag.id, "model", modelId)}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}

                      {/* Botón para Agregar Agente */}
                      <button
                        onClick={handleAddAgent}
                        className="w-full py-4 border border-dashed border-input hover:border-primary/40 rounded-2xl flex items-center justify-center gap-2 text-xs text-muted-foreground hover:text-primary transition-all cursor-pointer bg-card/5 hover:bg-card/10 font-bold"
                      >
                        <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                        </svg>
                        <span>Agregar Agente al Equipo</span>
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </motion.div>
          ) : activeExp ? (
            <motion.div
              key="experiment-details"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex-1 min-h-0"
            >
              {activeVariantTab === "compare" ? (
                <JudgeReport
                  exp={activeExp}
                  isJudging={isJudging}
                  onJudge={async () => {
                    if (!onJudgeExperiment) return;
                    setIsJudging(true);
                    try {
                      await onJudgeExperiment(activeExp.id);
                    } finally {
                      setIsJudging(false);
                    }
                  }}
                  onNavigate={(tab) => setActiveVariantTab(tab)}
                />
              ) : (
                <VariantViewer
                  experimentId={activeExp.id}
                  variantKey={activeVariantTab}
                  activeSessionId={activeExp.variants[activeVariantTab]?.activeSessionId || null}
                  status={
                    activeExp.status === "running"
                      ? (activeExp.variants[activeVariantTab]?.result
                        ? activeExp.variants[activeVariantTab].result.status
                        : (activeExp.variants[activeVariantTab]?.activeSessionId ? "running" : "pending"))
                      : (activeExp.variants[activeVariantTab]?.result?.status || "pending")
                  }
                  result={activeExp.variants[activeVariantTab]?.result || null}
                  criteria={activeExp.judge?.criteria}
                  expName={activeExp.name}
                  expDescription={activeExp.taskPrompt}
                />
              )}
            </motion.div>
          ) : (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex-1 flex flex-col items-center justify-center text-center p-12"
            >
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-xs text-muted-foreground">Cargando detalles del experimento...</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Modal Editor / Creador de Experimentos */}
      {isEditorOpen && (
        <div className="fixed inset-0 z-55 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-card border border-input rounded-2xl w-full max-w-xl p-6 space-y-4 shadow-2xl text-left"
          >
            <div>
              <h3 className="text-sm font-bold text-foreground tracking-wide uppercase">
                {editingExpId ? "Editar Experimento" : "Nuevo Experimento"}
              </h3>
              <p className="text-[11px] text-muted-foreground">
                Diseñá tu caso de prueba y configurá los criterios del LLM-Judge para evaluar las variantes.
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs uppercase font-bold text-muted-foreground tracking-wider block mb-1">
                  Nombre del Experimento
                </label>
                <input
                  type="text"
                  value={editorName}
                  onChange={(e) => setEditorName(e.target.value)}
                  placeholder="Ej: Benchmark Traducción de Código"
                  className="w-full bg-background border border-input rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-primary text-foreground"
                />
              </div>

              <div>
                <label className="text-xs uppercase font-bold text-muted-foreground tracking-wider block mb-1">
                  Prompt de Tarea (Task Prompt)
                </label>
                <textarea
                  value={editorPrompt}
                  onChange={(e) => setEditorPrompt(e.target.value)}
                  placeholder="Ej: Escribe un script en Python que calcule el factorial de un número usando recursividad."
                  rows={4}
                  className="w-full bg-background border border-input rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-primary text-foreground font-mono"
                />
              </div>

              <div>
                <label className="text-xs uppercase font-bold text-muted-foreground tracking-wider block mb-1">
                  Criterios de Evaluación
                </label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={newCriterion}
                    onChange={(e) => setNewCriterion(e.target.value)}
                    placeholder="Ej: Completitud"
                    className="flex-1 bg-background border border-input rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-primary text-foreground"
                  />
                  <button
                    onClick={handleAddCriterion}
                    className="px-3 py-2 bg-background border border-input hover:bg-card-hover rounded-xl text-xs font-bold text-foreground cursor-pointer"
                  >
                    Agregar
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {editorCriteria.map((c, i) => (
                    <span
                      key={i}
                      className="text-xs px-2.5 py-1 bg-background border border-input rounded-lg text-muted-foreground flex items-center gap-1.5"
                    >
                      <span>{c}</span>
                      <button
                        onClick={() => handleRemoveCriterion(i)}
                        className="text-destructive hover:text-destructive/80 font-bold cursor-pointer"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-input/50 pt-4">
              <button
                onClick={() => setIsEditorOpen(false)}
                className="px-4 py-2 bg-background border border-input hover:bg-card-hover rounded-xl text-xs font-bold text-foreground cursor-pointer"
              >
                {l.cancel}
              </button>
              <button
                onClick={handleSaveExperiment}
                disabled={!editorName.trim() || !editorPrompt.trim()}
                className="px-4 py-2 bg-primary text-background hover:bg-primary/90 disabled:opacity-50 rounded-xl text-xs font-bold transition-all shadow cursor-pointer"
              >
                Guardar Experimento
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Modal Prompt de Ejecución Dinámico */}
      {isRunPromptModalOpen && (
        <div className="fixed inset-0 z-55 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-card border border-input rounded-2xl w-full max-w-xl p-6 space-y-4 shadow-2xl text-left"
          >
            <div>
              <h3 className="text-sm font-bold text-foreground tracking-wide uppercase">
                Iniciar Corrida de Experimento
              </h3>
              <p className="text-[11px] text-muted-foreground">
                Ingresá la tarea específica (prompt) sobre la cual querés que debata y resuelva la tripulación en esta ejecución.
              </p>
            </div>

            <div>
              <label className="text-xs uppercase font-bold text-muted-foreground tracking-wider block mb-1">
                Tarea / Prompt de Ejecución
              </label>
              <textarea
                value={runPromptValue}
                onChange={(e) => setRunPromptValue(e.target.value)}
                placeholder="Ej: Escribe un script en Python que busque imágenes en un directorio usando glob y PIL."
                rows={5}
                className="w-full bg-background border border-input rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-primary text-foreground font-mono leading-relaxed"
              />
            </div>

            <div className="flex justify-end gap-2 border-t border-input/50 pt-4">
              <button
                onClick={() => {
                  setIsRunPromptModalOpen(false);
                  setRunningExpId(null);
                }}
                className="px-4 py-2 bg-background border border-input hover:bg-card-hover rounded-xl text-xs font-bold text-foreground cursor-pointer"
              >
                {l.cancel}
              </button>
              <button
                onClick={handleConfirmRun}
                disabled={!runPromptValue.trim()}
                className="px-4 py-2 bg-primary text-background hover:bg-primary/90 disabled:opacity-50 rounded-xl text-xs font-bold transition-all shadow cursor-pointer"
              >
                {l.confirmRun}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
