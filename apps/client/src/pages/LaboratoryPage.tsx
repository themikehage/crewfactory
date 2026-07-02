import { useState, useEffect, useCallback, useRef } from "react";
import { apiFetch } from "@/lib/api";
import { useChannel } from "@/hooks/useChannel";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { motion, AnimatePresence } from "framer-motion";

interface Stance {
  id: string;
  name: string;
  template: string;
  position: "A" | "B";
  briefing: string;
  icon: string;
  color: string;
}

interface Agent {
  id: string;
  name: string;
  role: string;
  stance: Stance;
  systemPrompt: string;
  model: string;
  leader?: boolean;
}

interface VariantRunResult {
  status: "pending" | "running" | "completed" | "failed";
  durationMs: number;
  tokensIn: number;
  tokensOut: number;
  negotiationRounds?: number;
  escalationsToLeader?: number;
  agreementReached?: boolean;
  finalOutput: string;
  scores?: {
    taskQuality: number;
    efficiencyScore: number;
    negotiationScore?: number;
    globalScore: number;
  };
}

interface Variant {
  type: "single" | "multi_no_leader" | "multi_with_leader";
  agents: Agent[];
  result?: VariantRunResult;
}

interface Experiment {
  id: string;
  name: string;
  taskPrompt: string;
  status: "designing" | "running" | "completed" | "failed";
  positions: Stance[];
  judge: {
    criteria: string[];
    autoEvaluate: boolean;
  };
  variants: {
    single: Variant;
    multiNoLeader: Variant;
    multiWithLeader: Variant;
  };
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  blueprintId?: string;
}

interface Blueprint {
  id: string;
  name: string;
  description: string;
  testCases: {
    id: string;
    name: string;
    description: string;
    taskPrompt: string;
  }[];
}

interface Props {
  onNavigate: (path: string) => void;
}

export function LaboratoryPage({ onNavigate }: Props) {
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [blueprints, setBlueprints] = useState<Blueprint[]>([]);
  const [selectedExpId, setSelectedExpId] = useState<string | null>(null);
  const [loadingExps, setLoadingExps] = useState(true);

  // Wizard state
  const [isWizard, setIsWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [wizardName, setWizardName] = useState("");
  const [wizardPrompt, setWizardPrompt] = useState("");
  const [selectedBlueprintId, setSelectedBlueprintId] = useState<string>("");
  const [selectedBlueprint, setSelectedBlueprint] = useState<Blueprint | null>(null);

  // Step 2 analysis
  const [suggestedDichotomies, setSuggestedDichotomies] = useState<{ id: string; reason: string }[]>([]);
  const [selectedDichotomies, setSelectedDichotomies] = useState<string[]>([]);
  const [criteria, setCriteria] = useState<string[]>([]);
  const [newCriterion, setNewCriterion] = useState("");
  const [analyzingTask, setAnalyzingTask] = useState(false);

  // Step 3 customization
  const [stances, setStances] = useState<Stance[]>([]);
  const [generatingBriefings, setGeneratingBriefings] = useState(false);
  const [customAgents, setCustomAgents] = useState<Agent[]>([]);

  // Active run monitoring
  const activeExp = experiments.find((e) => e.id === selectedExpId) || null;
  const pollTimerRef = useRef<Timer | null>(null);

  const fetchExperiments = useCallback(async () => {
    try {
      const res = await apiFetch("/api/experiments");
      if (res.ok) {
        const data = await res.json();
        setExperiments(data.experiments || []);
      }
    } catch (e) {
      console.error("Failed to load experiments:", e);
    } finally {
      setLoadingExps(false);
    }
  }, []);

  const fetchBlueprints = useCallback(async () => {
    try {
      const res = await apiFetch("/api/experiments/blueprints");
      if (res.ok) {
        const data = await res.json();
        setBlueprints(data.blueprints || []);
      }
    } catch (e) {
      console.error("Failed to load blueprints:", e);
    }
  }, []);

  useEffect(() => {
    fetchExperiments();
    fetchBlueprints();
  }, [fetchExperiments, fetchBlueprints]);

  // Dynamic status polling when experiment is running
  useEffect(() => {
    if (activeExp && activeExp.status === "running") {
      pollTimerRef.current = setInterval(async () => {
        try {
          const res = await apiFetch(`/api/experiments/${activeExp.id}`);
          if (res.ok) {
            const data = await res.json();
            const updated = data.experiment as Experiment;
            setExperiments((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
            if (updated.status !== "running") {
              if (pollTimerRef.current) clearInterval(pollTimerRef.current);
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
  }, [activeExp]);

  const handleSelectBlueprint = (blueprintId: string) => {
    setSelectedBlueprintId(blueprintId);
    const bp = blueprints.find((b) => b.id === blueprintId) || null;
    setSelectedBlueprint(bp);
    if (bp) {
      setWizardName(bp.name);
      if (bp.testCases && bp.testCases[0]) {
        setWizardPrompt(bp.testCases[0].taskPrompt || bp.testCases[0].description);
      }
    }
  };

  const handleAnalyzeTask = async () => {
    if (!wizardPrompt.trim()) return;
    setAnalyzingTask(true);
    try {
      const res = await apiFetch("/api/experiments/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskPrompt: wizardPrompt })
      });
      if (res.ok) {
        const data = await res.json();
        setSuggestedDichotomies(data.suggestedDichotomies || []);
        setSelectedDichotomies(data.suggestedDichotomies?.map((d: any) => d.id) || []);
        setCriteria(data.criteria || []);
        setWizardStep(2);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setAnalyzingTask(false);
    }
  };

  const handleAddCriterion = () => {
    if (newCriterion.trim() && !criteria.includes(newCriterion.trim())) {
      setCriteria([...criteria, newCriterion.trim()]);
      setNewCriterion("");
    }
  };

  const handleRemoveCriterion = (idx: number) => {
    setCriteria(criteria.filter((_, i) => i !== idx));
  };

  const handleGenerateStances = async () => {
    setGeneratingBriefings(true);
    try {
      const res = await apiFetch("/api/experiments/generate-briefings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskPrompt: wizardPrompt, dichotomies: selectedDichotomies })
      });
      if (res.ok) {
        const data = await res.json();
        const generatedStances = data.briefings || [];
        setStances(generatedStances);

        // Map initial agents from generated stances
        const agentsList: Agent[] = generatedStances.map((s: Stance, i: number) => ({
          id: `agent_${i}`,
          name: s.name,
          role: `Especialista en ${s.name}`,
          stance: s,
          systemPrompt: s.briefing,
          model: "anthropic/claude-3-5-sonnet"
        }));

        // Add a Moderator/Lead agent if not empty
        if (agentsList.length > 0) {
          agentsList.push({
            id: "leader",
            name: "Moderador Principal",
            role: "Coordinador de Debate & Veredictos",
            stance: {
              id: "moderator",
              name: "Moderador",
              template: "moderator",
              position: "A",
              briefing: "Eres el Coordinador del canal. Moderá el debate técnico, asegurá el progreso, solicita contrapropuestas claras y emite un veredicto definitivo en caso de desacuerdo.",
              icon: "Award",
              color: "#a855f7"
            },
            systemPrompt: "Eres el Coordinador del canal. Moderá el debate técnico, asegurá el progreso, solicita contrapropuestas claras y emite un veredicto definitivo en caso de desacuerdo.",
            model: "anthropic/claude-3-5-sonnet",
            leader: true
          });
        }

        setCustomAgents(agentsList);
        setWizardStep(3);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setGeneratingBriefings(false);
    }
  };

  const handleUpdateAgentPrompt = (id: string, text: string) => {
    setCustomAgents(prev => prev.map(a => a.id === id ? { ...a, systemPrompt: text } : a));
  };

  const handleUpdateAgentModel = (id: string, model: string) => {
    setCustomAgents(prev => prev.map(a => a.id === id ? { ...a, model } : a));
  };

  const handleSaveAndRun = async () => {
    try {
      const singleAgents: Agent[] = [
        {
          id: "baseline",
          name: "General Agent",
          role: "General Assistant",
          stance: stances[0] || { id: "general", name: "General", template: "", position: "A", briefing: "", icon: "", color: "" },
          systemPrompt: "Eres un asistente general de IA resolviendo la tarea de forma directa.",
          model: "anthropic/claude-3-5-sonnet"
        }
      ];

      const body = selectedBlueprintId ? {
        name: wizardName,
        taskPrompt: wizardPrompt,
        blueprintId: selectedBlueprintId,
        autoEvaluate: true
      } : {
        name: wizardName,
        taskPrompt: wizardPrompt,
        autoEvaluate: true,
        criteria,
        positions: stances,
        variants: {
          single: { type: "single", agents: singleAgents },
          multiNoLeader: { type: "multi_no_leader", agents: customAgents.filter(a => !a.leader) },
          multiWithLeader: { type: "multi_with_leader", agents: customAgents }
        }
      };

      const res = await apiFetch("/api/experiments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      if (res.ok) {
        const data = await res.json();
        const newExp = data.experiment as Experiment;
        setExperiments((prev) => [newExp, ...prev]);
        setSelectedExpId(newExp.id);
        setIsWizard(false);
        setWizardStep(1);

        // Run immediately
        await apiFetch(`/api/experiments/${newExp.id}/run`, { method: "POST" });
        fetchExperiments();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleTriggerRun = async (expId: string) => {
    try {
      await apiFetch(`/api/experiments/${expId}/run`, { method: "POST" });
      fetchExperiments();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteExp = async (expId: string) => {
    if (!confirm("¿Seguro que deseas eliminar este experimento?")) return;
    try {
      const res = await apiFetch(`/api/experiments/${expId}`, { method: "DELETE" });
      if (res.ok) {
        setExperiments(prev => prev.filter(e => e.id !== expId));
        if (selectedExpId === expId) setSelectedExpId(null);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Rendering Helper: Live Column Messages
  function LiveStreamColumn({ channelId, title, activeModel, result, expStatus }: { channelId: string; title: string; activeModel: string; result?: VariantRunResult; expStatus: string }) {
    const { messages } = useChannel(expStatus === "running" ? channelId : null);

    return (
      <div className="flex flex-col bg-surface border border-surface-hover rounded-xl overflow-hidden h-[450px]">
        <div className="p-3 bg-surface border-b border-surface-hover flex justify-between items-center flex-shrink-0">
          <div>
            <h4 className="text-xs font-semibold text-text-primary uppercase tracking-wider">{title}</h4>
            <p className="text-[10px] text-text-secondary">{activeModel}</p>
          </div>
          {expStatus === "running" && (
            <div className="flex items-center gap-1.5 bg-accent/10 px-2 py-0.5 rounded-full text-[9px] text-accent border border-accent/20 animate-pulse">
              <span className="w-1.5 h-1.5 bg-accent rounded-full animate-ping" />
              <span>Transmitiendo</span>
            </div>
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar text-xs">
          {expStatus === "running" ? (
            messages.length === 0 ? (
              <div className="text-center text-text-secondary/40 py-8 animate-pulse">Esperando turno de los agentes...</div>
            ) : (
              messages.map((m, idx) => (
                <div key={idx} className="space-y-1 bg-surface-hover/30 p-2.5 rounded-lg border border-surface-hover/50">
                  <span className="font-semibold text-accent">{m.agentName || "User"}</span>
                  <div className="prose prose-invert max-w-none break-words text-text-secondary">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {m.content}
                    </ReactMarkdown>
                  </div>
                </div>
              ))
            )
          ) : result && result.finalOutput ? (
            <div className="prose prose-invert max-w-none text-text-secondary">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {result.finalOutput}
              </ReactMarkdown>
            </div>
          ) : (
            <div className="text-center text-text-secondary/30 py-16">Sin ejecución cargada</div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 bg-bg text-text-primary font-body">
      {/* Sidebar: Historical list */}
      <div className="w-72 border-r border-surface flex flex-col flex-shrink-0 bg-bg">
        <div className="p-4 border-b border-surface flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-wide text-text-primary uppercase">Experimentos</h2>
          <button
            onClick={() => {
              setIsWizard(true);
              setWizardStep(1);
            }}
            className="p-1.5 hover:bg-surface hover:text-accent text-text-secondary rounded-lg transition-colors border border-surface"
            title="Crear Experimento"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {loadingExps ? (
            <div className="text-xs text-text-secondary/40 text-center py-4 animate-pulse">Cargando histórico...</div>
          ) : experiments.length === 0 ? (
            <div className="text-xs text-text-secondary/30 text-center py-8">No hay experimentos registrados</div>
          ) : (
            experiments.map((exp) => {
              const isSelected = exp.id === selectedExpId && !isWizard;
              return (
                <div
                  key={exp.id}
                  onClick={() => {
                    setSelectedExpId(exp.id);
                    setIsWizard(false);
                  }}
                  className={`group p-3 rounded-xl transition-all cursor-pointer border text-left flex items-center justify-between ${
                    isSelected
                      ? "bg-surface border-accent/40 shadow-sm"
                      : "bg-surface/30 border-transparent hover:bg-surface hover:border-surface-hover"
                  }`}
                >
                  <div className="min-w-0 flex-1 pr-2">
                    <h3 className="text-xs font-semibold text-text-primary truncate">{exp.name}</h3>
                    <p className="text-[10px] text-text-secondary truncate mt-0.5">{exp.taskPrompt}</p>
                    <div className="flex items-center gap-1.5 mt-2">
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        exp.status === "completed" ? "bg-accent" :
                        exp.status === "running" ? "bg-warning animate-ping" :
                        exp.status === "failed" ? "bg-error" : "bg-text-secondary/40"
                      }`} />
                      <span className="text-[9px] uppercase font-semibold text-text-secondary">{exp.status}</span>
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteExp(exp.id);
                    }}
                    className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-surface-hover/80 text-text-secondary hover:text-error transition-all"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Main Panel */}
      <div className="flex-1 min-w-0 bg-bg flex flex-col p-6 overflow-y-auto">
        <AnimatePresence mode="wait">
          {isWizard ? (
            /* WIZARD MODE */
            <motion.div
              key="wizard"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="max-w-3xl mx-auto w-full bg-surface border border-surface-hover rounded-2xl p-6 shadow-xl space-y-6"
            >
              <div className="flex items-center justify-between border-b border-surface-hover pb-4">
                <div>
                  <h1 className="text-base font-bold text-text-primary">Laboratorio de Benchmarking Multivariable</h1>
                  <p className="text-xs text-text-secondary mt-1">Configuración guiada de experimentos y debate competitivo.</p>
                </div>
                <button
                  onClick={() => {
                    setIsWizard(false);
                    onNavigate("/");
                  }}
                  className="px-3 py-1.5 bg-surface-hover hover:bg-surface-hover/80 text-text-primary rounded-lg text-xs font-semibold border border-surface-hover"
                >
                  Cancelar
                </button>
              </div>

              {/* Progress Steps Indicators */}
              <div className="flex items-center justify-between bg-bg/50 p-3 rounded-xl border border-surface-hover/50 text-[10px] font-semibold text-text-secondary">
                <div className="flex items-center gap-1.5">
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center ${wizardStep >= 1 ? "bg-accent text-bg" : "bg-surface-hover text-text-secondary"}`}>1</span>
                  <span>Configuración General</span>
                </div>
                <div className="w-12 h-px bg-surface-hover" />
                <div className="flex items-center gap-1.5">
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center ${wizardStep >= 2 ? "bg-accent text-bg" : "bg-surface-hover text-text-secondary"}`}>2</span>
                  <span>Análisis & Rúbrica</span>
                </div>
                <div className="w-12 h-px bg-surface-hover" />
                <div className="flex items-center gap-1.5">
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center ${wizardStep >= 3 ? "bg-accent text-bg" : "bg-surface-hover text-text-secondary"}`}>3</span>
                  <span>Briefings & Modelos</span>
                </div>
                <div className="w-12 h-px bg-surface-hover" />
                <div className="flex items-center gap-1.5">
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center ${wizardStep >= 4 ? "bg-accent text-bg" : "bg-surface-hover text-text-secondary"}`}>4</span>
                  <span>Confirmación</span>
                </div>
              </div>

              {/* Step 1 Content */}
              {wizardStep === 1 && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-text-secondary mb-1">Nombre del Experimento</label>
                    <input
                      type="text"
                      value={wizardName}
                      onChange={(e) => setWizardName(e.target.value)}
                      placeholder="Ej: Estimación de Alcance AutoConsulting v2"
                      className="w-full bg-bg border border-surface-hover rounded-xl px-3 py-2.5 text-xs text-text-primary focus:outline-none focus:border-accent/40"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-text-secondary mb-1">Cargar desde Template / Blueprint (Opcional)</label>
                    <select
                      value={selectedBlueprintId}
                      onChange={(e) => handleSelectBlueprint(e.target.value)}
                      className="w-full bg-bg border border-surface-hover rounded-xl px-3 py-2.5 text-xs text-text-primary focus:outline-none focus:border-accent/40"
                    >
                      <option value="">-- Diseñar desde cero (Scratch) --</option>
                      {blueprints.map((bp) => (
                        <option key={bp.id} value={bp.id}>{bp.name}</option>
                      ))}
                    </select>
                    {selectedBlueprint && (
                      <p className="text-[10px] text-text-secondary mt-1">{selectedBlueprint.description}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-text-secondary mb-1">Project Brief / Prompt de la Tarea</label>
                    <textarea
                      rows={5}
                      value={wizardPrompt}
                      onChange={(e) => setWizardPrompt(e.target.value)}
                      placeholder="Describe la tarea o proyecto a estimar/evaluar..."
                      className="w-full bg-bg border border-surface-hover rounded-xl px-3 py-2.5 text-xs text-text-primary focus:outline-none focus:border-accent/40 font-mono"
                    />
                  </div>

                  <div className="flex justify-end pt-2">
                    {selectedBlueprintId ? (
                      <button
                        onClick={handleSaveAndRun}
                        className="px-4 py-2 bg-accent text-bg hover:bg-accent/90 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
                      >
                        <span>Cargar Template y Lanzar</span>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <polygon points="5 3 19 12 5 21 5 3" />
                        </svg>
                      </button>
                    ) : (
                      <button
                        onClick={handleAnalyzeTask}
                        disabled={analyzingTask || !wizardPrompt.trim() || !wizardName.trim()}
                        className="px-4 py-2 bg-accent text-bg hover:bg-accent/90 disabled:bg-surface-hover disabled:text-text-secondary/40 rounded-xl text-xs font-bold transition-all flex items-center gap-2"
                      >
                        {analyzingTask ? (
                          <>
                            <span className="w-3 h-3 border-2 border-bg border-t-transparent rounded-full animate-spin" />
                            <span>Analizando Tarea...</span>
                          </>
                        ) : (
                          <>
                            <span>Analizar Tarea con IA</span>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <polyline points="9 18 15 12 9 6" />
                            </svg>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Step 2 Content */}
              {wizardStep === 2 && (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-xs font-semibold text-text-primary uppercase tracking-wider mb-2">Dicotomías Recomendadas por IA</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {suggestedDichotomies.map((dic) => (
                        <div
                          key={dic.id}
                          onClick={() => {
                            if (selectedDichotomies.includes(dic.id)) {
                              setSelectedDichotomies(selectedDichotomies.filter((id) => id !== dic.id));
                            } else {
                              setSelectedDichotomies([...selectedDichotomies, dic.id]);
                            }
                          }}
                          className={`p-3 rounded-xl border transition-all cursor-pointer text-left ${
                            selectedDichotomies.includes(dic.id)
                              ? "bg-surface border-accent/40"
                              : "bg-surface-hover/30 border-transparent hover:bg-surface-hover"
                          }`}
                        >
                          <h4 className="text-xs font-bold text-text-primary capitalize">{dic.id.replace("_", " ")}</h4>
                          <p className="text-[10px] text-text-secondary mt-1">{dic.reason}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-xs font-semibold text-text-primary uppercase tracking-wider mb-2">Criterios del Rubro de Evaluación (Judge)</h3>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newCriterion}
                        onChange={(e) => setNewCriterion(e.target.value)}
                        placeholder="Añadir criterio personalizado..."
                        className="flex-1 bg-bg border border-surface-hover rounded-xl px-3 py-2 text-xs text-text-primary focus:outline-none"
                      />
                      <button
                        onClick={handleAddCriterion}
                        className="px-3 bg-surface-hover hover:bg-surface rounded-xl text-xs border border-surface-hover"
                      >
                        Añadir
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {criteria.map((c, i) => (
                        <div key={i} className="flex items-center gap-1.5 bg-surface-hover px-2.5 py-1 rounded-full text-[10px] border border-surface-hover">
                          <span>{c}</span>
                          <button
                            onClick={() => handleRemoveCriterion(i)}
                            className="text-text-secondary hover:text-error font-bold"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex justify-between pt-4 border-t border-surface-hover">
                    <button
                      onClick={() => setWizardStep(1)}
                      className="px-4 py-2 bg-surface-hover hover:bg-surface-hover/80 text-text-primary rounded-xl text-xs font-semibold"
                    >
                      Atrás
                    </button>
                    <button
                      onClick={handleGenerateStances}
                      disabled={generatingBriefings || selectedDichotomies.length === 0}
                      className="px-4 py-2 bg-accent text-bg hover:bg-accent/90 disabled:bg-surface-hover disabled:text-text-secondary/40 rounded-xl text-xs font-bold transition-all flex items-center gap-2"
                    >
                      {generatingBriefings ? (
                        <>
                          <span className="w-3 h-3 border-2 border-bg border-t-transparent rounded-full animate-spin" />
                          <span>Generando Agentes...</span>
                        </>
                      ) : (
                        <>
                          <span>Generar Briefings de Agentes</span>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <polyline points="9 18 15 12 9 6" />
                          </svg>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Step 3 Content */}
              {wizardStep === 3 && (
                <div className="space-y-4">
                  <h3 className="text-xs font-semibold text-text-primary uppercase tracking-wider">Customización de Briefings del Debate</h3>
                  <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                    {customAgents.map((ag) => (
                      <div key={ag.id} className="p-4 bg-bg/50 rounded-xl border border-surface-hover space-y-3 text-left">
                        <div className="flex justify-between items-center">
                          <div>
                            <span className="text-xs font-bold text-accent">{ag.name}</span>
                            <span className="text-[10px] text-text-secondary block">{ag.role}</span>
                          </div>
                          <div>
                            <label className="text-[10px] text-text-secondary mr-2">Modelo:</label>
                            <select
                              value={ag.model}
                              onChange={(e) => handleUpdateAgentModel(ag.id, e.target.value)}
                              className="bg-bg border border-surface-hover rounded px-2 py-1 text-[10px] text-text-primary"
                            >
                              <option value="anthropic/claude-3-5-sonnet">Claude 3.5 Sonnet</option>
                              <option value="openai/gpt-4o">GPT-4o</option>
                              <option value="google/gemini-1.5-pro">Gemini 1.5 Pro</option>
                            </select>
                          </div>
                        </div>

                        <div>
                          <label className="block text-[10px] text-text-secondary mb-1">Instrucciones / System Prompt del Agente</label>
                          <textarea
                            rows={3}
                            value={ag.systemPrompt}
                            onChange={(e) => handleUpdateAgentPrompt(ag.id, e.target.value)}
                            className="w-full bg-bg border border-surface-hover rounded-xl px-2.5 py-1.5 text-xs text-text-secondary focus:text-text-primary focus:outline-none"
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex justify-between pt-4 border-t border-surface-hover">
                    <button
                      onClick={() => setWizardStep(2)}
                      className="px-4 py-2 bg-surface-hover hover:bg-surface-hover/80 text-text-primary rounded-xl text-xs font-semibold"
                    >
                      Atrás
                    </button>
                    <button
                      onClick={() => setWizardStep(4)}
                      className="px-4 py-2 bg-accent text-bg hover:bg-accent/90 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
                    >
                      <span>Continuar</span>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </button>
                  </div>
                </div>
              )}

              {/* Step 4 Content */}
              {wizardStep === 4 && (
                <div className="space-y-4 text-left">
                  <h3 className="text-xs font-semibold text-text-primary uppercase tracking-wider">Estructura del Experimento</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="p-4 bg-bg/50 rounded-xl border border-surface-hover space-y-1">
                      <h4 className="text-xs font-bold text-text-primary">1. Single Agent (Baseline)</h4>
                      <p className="text-[10px] text-text-secondary">Un único agente general procesando el brief de forma directa.</p>
                      <span className="text-[9px] bg-accent/10 px-2 py-0.5 rounded text-accent border border-accent/20 block w-max mt-2">1 Agente</span>
                    </div>
                    <div className="p-4 bg-bg/50 rounded-xl border border-surface-hover space-y-1">
                      <h4 className="text-xs font-bold text-text-primary">2. Multi-Agent No Leader</h4>
                      <p className="text-[10px] text-text-secondary">N agentes debatiendo en canal abierto (broadcast) sin jerarquías.</p>
                      <span className="text-[9px] bg-accent/10 px-2 py-0.5 rounded text-accent border border-accent/20 block w-max mt-2">{customAgents.filter(a => !a.leader).length} Agentes</span>
                    </div>
                    <div className="p-4 bg-bg/50 rounded-xl border border-surface-hover space-y-1">
                      <h4 className="text-xs font-bold text-text-primary">3. Multi-Agent With Leader</h4>
                      <p className="text-[10px] text-text-secondary">N agentes coordinados por un líder. Protocolo de negociación y veredicto.</p>
                      <span className="text-[9px] bg-accent/10 px-2 py-0.5 rounded text-accent border border-accent/20 block w-max mt-2">{customAgents.length} Agentes</span>
                    </div>
                  </div>

                  <div className="flex justify-between pt-4 border-t border-surface-hover">
                    <button
                      onClick={() => setWizardStep(3)}
                      className="px-4 py-2 bg-surface-hover hover:bg-surface-hover/80 text-text-primary rounded-xl text-xs font-semibold"
                    >
                      Atrás
                    </button>
                    <button
                      onClick={handleSaveAndRun}
                      className="px-6 py-2 bg-accent text-bg hover:bg-accent/90 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow"
                    >
                      <span>Guardar y Lanzar Experimento</span>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polygon points="5 3 19 12 5 21 5 3" />
                      </svg>
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          ) : activeExp ? (
            /* DASHBOARD / DISPLAY MODE */
            <motion.div
              key="dashboard"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-6 text-left"
            >
              {/* Header block */}
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-surface border border-surface-hover p-6 rounded-2xl shadow-sm">
                <div>
                  <h1 className="text-lg font-bold text-text-primary">{activeExp.name}</h1>
                  <p className="text-xs text-text-secondary font-mono mt-1 pr-4 max-w-2xl">{activeExp.taskPrompt}</p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="flex items-center gap-2 bg-bg px-3 py-1.5 rounded-xl border border-surface-hover">
                    <span className={`w-2 h-2 rounded-full ${
                      activeExp.status === "completed" ? "bg-accent" :
                      activeExp.status === "running" ? "bg-warning animate-ping" :
                      activeExp.status === "failed" ? "bg-error" : "bg-text-secondary/40"
                    }`} />
                    <span className="text-[10px] uppercase font-bold text-text-secondary">{activeExp.status}</span>
                  </div>
                  {activeExp.status !== "running" && (
                    <button
                      onClick={() => handleTriggerRun(activeExp.id)}
                      className="px-4 py-2 bg-accent text-bg hover:bg-accent/90 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow"
                    >
                      <span>Ejecutar</span>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polygon points="5 3 19 12 5 21 5 3" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>

              {/* Scoring Comparative Section */}
              {activeExp.status === "completed" && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Custom SVG Bar Chart */}
                  <div className="bg-surface border border-surface-hover p-5 rounded-2xl shadow-sm space-y-4">
                    <h3 className="text-xs font-bold text-text-primary uppercase tracking-wider">Desempeño Comparativo (Puntuaciones Globales)</h3>
                    <div className="space-y-4 pt-2">
                      {[
                        { label: "Single Agent (Baseline)", score: activeExp.variants.single.result?.scores?.globalScore || 0, color: "#6b7280" },
                        { label: "Multi No Leader", score: activeExp.variants.multiNoLeader.result?.scores?.globalScore || 0, color: "#3b82f6" },
                        { label: "Multi With Leader", score: activeExp.variants.multiWithLeader.result?.scores?.globalScore || 0, color: "#a855f7" }
                      ].map((item, idx) => (
                        <div key={idx} className="space-y-1">
                          <div className="flex justify-between items-center text-[10px] font-semibold text-text-secondary">
                            <span>{item.label}</span>
                            <span className="text-text-primary">{item.score} / 100</span>
                          </div>
                          <div className="w-full bg-bg h-3 rounded-full overflow-hidden border border-surface-hover">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${item.score}%` }}
                              transition={{ duration: 0.8, delay: idx * 0.1 }}
                              className="h-full rounded-full"
                              style={{ backgroundColor: item.color }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Quantitative Metrics Matrix */}
                  <div className="bg-surface border border-surface-hover p-5 rounded-2xl shadow-sm space-y-3">
                    <h3 className="text-xs font-bold text-text-primary uppercase tracking-wider">Matriz de Métricas Cuantitativas</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-surface-hover text-text-secondary/70">
                            <th className="py-2">Variante</th>
                            <th className="py-2 text-center">Global</th>
                            <th className="py-2 text-center">Calidad</th>
                            <th className="py-2 text-center">Tiempo (s)</th>
                            <th className="py-2 text-center">Tokens</th>
                            <th className="py-2 text-center">Acuerdo</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-surface-hover text-text-secondary">
                          {[
                            { name: "Single Agent", variant: activeExp.variants.single, key: "single" },
                            { name: "Multi No Leader", variant: activeExp.variants.multiNoLeader, key: "multi_no_leader" },
                            { name: "Multi With Leader", variant: activeExp.variants.multiWithLeader, key: "multi_with_leader" }
                          ].map((row, idx) => {
                            const res = row.variant.result;
                            const globalScore = res?.scores?.globalScore ?? "-";
                            const qualityScore = res?.scores?.taskQuality ?? "-";
                            const seconds = res ? (res.durationMs / 1000).toFixed(1) : "-";
                            const tokens = res ? (res.tokensIn + res.tokensOut).toLocaleString() : "-";
                            const agreement = res ? (res.agreementReached ? "Sí" : "No") : "-";

                            return (
                              <tr key={idx} className="hover:bg-surface-hover/20">
                                <td className="py-2.5 font-semibold text-text-primary">{row.name}</td>
                                <td className="py-2.5 text-center font-bold text-accent">{globalScore}</td>
                                <td className="py-2.5 text-center">{qualityScore}</td>
                                <td className="py-2.5 text-center">{seconds}s</td>
                                <td className="py-2.5 text-center">{tokens}</td>
                                <td className="py-2.5 text-center">{agreement}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* Three Column Chat Output Viewer */}
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                <LiveStreamColumn
                  channelId={`lab_${activeExp.id}_single`}
                  title="Single Agent (Baseline)"
                  activeModel="Claude 3.5 Sonnet"
                  result={activeExp.variants.single.result}
                  expStatus={activeExp.status}
                />
                <LiveStreamColumn
                  channelId={`lab_${activeExp.id}_multiNoLeader`}
                  title="Multi-Agent (Horizontal)"
                  activeModel="Modelos Mixtos / Debate"
                  result={activeExp.variants.multiNoLeader.result}
                  expStatus={activeExp.status}
                />
                <LiveStreamColumn
                  channelId={`lab_${activeExp.id}_multiWithLeader`}
                  title="Multi-Agent (Con Líder)"
                  activeModel="Modelos Mixtos / Negociación"
                  result={activeExp.variants.multiWithLeader.result}
                  expStatus={activeExp.status}
                />
              </div>
            </motion.div>
          ) : (
            /* EMPTY STATE DEFAULT */
            <div className="text-center py-20 bg-surface border border-surface-hover rounded-2xl">
              <svg className="mx-auto h-12 w-12 text-text-secondary/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4Z" />
              </svg>
              <h3 className="mt-2 text-sm font-semibold text-text-primary">Ningún experimento seleccionado</h3>
              <p className="mt-1 text-xs text-text-secondary">Selecciona un experimento del histórico o crea uno nuevo usando el configurador.</p>
              <div className="mt-6">
                <button
                  onClick={() => {
                    setIsWizard(true);
                    setWizardStep(1);
                  }}
                  className="px-4 py-2 bg-accent text-bg hover:bg-accent/90 rounded-xl text-xs font-bold transition-all shadow"
                >
                  Nuevo Experimento
                </button>
              </div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
