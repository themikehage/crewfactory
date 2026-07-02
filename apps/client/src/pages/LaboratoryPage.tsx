import { useState, useEffect, useCallback, useRef } from "react";
import { apiFetch } from "@/lib/api";
import { useLLMChannel } from "@/hooks/useLLMChannel";
import { AnimatePresence } from "framer-motion";
import { ExperimentSidebar } from "@/components/laboratory/ExperimentSidebar";
import { ExperimentHeader } from "@/components/laboratory/ExperimentHeader";
import { ComparativeMetrics } from "@/components/laboratory/ComparativeMetrics";
import { ExperimentLiveView } from "@/components/laboratory/ExperimentLiveView";
import { LaboratoryWizard } from "@/components/laboratory/wizard/LaboratoryWizard";
import type { Experiment, Blueprint, Stance, Agent } from "@/types/laboratory";

interface Props {
  onNavigate: (path: string) => void;
}

export function LaboratoryPage({ onNavigate: _onNavigate }: Props) {
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [blueprints, setBlueprints] = useState<Blueprint[]>([]);
  const [selectedExpId, setSelectedExpId] = useState<string | null>(null);
  const [loadingExps, setLoadingExps] = useState(true);

  const [isWizard, setIsWizard] = useState(false);
  const [wizardMode, setWizardMode] = useState<"create" | "edit">("create");
  const [editingExpId, setEditingExpId] = useState<string | null>(null);
  const [wizardStep, setWizardStep] = useState(1);
  const [wizardName, setWizardName] = useState("");
  const [wizardPrompt, setWizardPrompt] = useState("");
  const [selectedBlueprintId, setSelectedBlueprintId] = useState<string>("");
  const [selectedBlueprint, setSelectedBlueprint] = useState<Blueprint | null>(null);

  const [suggestedDichotomies, setSuggestedDichotomies] = useState<{ id: string; reason: string }[]>([]);
  const [selectedDichotomies, setSelectedDichotomies] = useState<string[]>([]);
  const [criteria, setCriteria] = useState<string[]>([]);
  const [newCriterion, setNewCriterion] = useState("");
  const analyzeChannel = useLLMChannel("lab_analyze");
  const [analyzeParseError, setAnalyzeParseError] = useState<string | null>(null);

  const [stances, setStances] = useState<Stance[]>([]);
  const briefingsChannel = useLLMChannel("lab_briefings");
  const [briefingsParseError, setBriefingsParseError] = useState<string | null>(null);
  const [customAgents, setCustomAgents] = useState<Agent[]>([]);
  const [defaultModel, setDefaultModel] = useState("anthropic/claude-3-5-sonnet");
  const [defaultModelLoaded, setDefaultModelLoaded] = useState(false);

  const activeExp = experiments.find((e) => e.id === selectedExpId) || null;
  const pollTimerRef = useRef<any>(null);

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
    const stored = localStorage.getItem("pi-selected-model");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setDefaultModel(`${parsed.provider}/${parsed.modelId}`);
        setDefaultModelLoaded(true);
      } catch {}
    }
    apiFetch("/api/experiments/default-model")
      .then((r) => r.json())
      .then((d) => {
        if (d.model) setDefaultModel(d.model);
      })
      .catch(() => {})
      .finally(() => setDefaultModelLoaded(true));
  }, [fetchExperiments, fetchBlueprints]);

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

  const resetWizard = () => {
    setWizardMode("create");
    setEditingExpId(null);
    setSelectedBlueprintId("");
    setSelectedBlueprint(null);
    setWizardName("");
    setWizardPrompt("");
    setWizardStep(1);
    setSuggestedDichotomies([]);
    setSelectedDichotomies([]);
    setCriteria([]);
    setStances([]);
    setCustomAgents([]);
    analyzeChannel.reset();
    briefingsChannel.reset();
    setAnalyzeParseError(null);
    setBriefingsParseError(null);
  };

  const openWizard = (mode: "create" | "edit", exp?: Experiment) => {
    if (mode === "create") {
      resetWizard();
    } else if (mode === "edit" && exp) {
      resetWizard();
      setWizardMode("edit");
      setEditingExpId(exp.id);
      setWizardName(exp.name);
      setWizardPrompt(exp.taskPrompt);
      setCriteria(exp.judge.criteria);

      if (exp.positions.length > 0) {
        setStances(exp.positions);
        setSuggestedDichotomies(exp.positions.map((p) => ({ id: p.id, reason: p.briefing })));
        setSelectedDichotomies(exp.positions.map((p) => p.template).filter(Boolean));
      }

      const allAgents = [
        ...(exp.variants.single.agents || []).filter((a) => a.id !== "baseline"),
        ...(exp.variants.multiWithLeader.agents || []),
      ];
      const uniqueAgents = allAgents.filter(
        (a, i, arr) => arr.findIndex((x) => x.id === a.id) === i
      );
      setCustomAgents(uniqueAgents);
    }
    setIsWizard(true);
  };

  useEffect(() => {
    fetch("/api/client-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        level: "INFO",
        message: `[LaboratoryPage] useEffect analyzeChannel triggered. result=${!!analyzeChannel.result} loading=${analyzeChannel.loading}`
      }),
    }).catch(() => {});

    if (analyzeChannel.result && !analyzeChannel.loading) {
      try {
        let rawJson = analyzeChannel.result.trim();
        const firstBrace = rawJson.indexOf("{");
        const lastBrace = rawJson.lastIndexOf("}");
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          rawJson = rawJson.substring(firstBrace, lastBrace + 1);
        } else if (rawJson.startsWith("```")) {
          rawJson = rawJson.replace(/^```[a-zA-Z-]*\n/, "").replace(/\n```$/, "");
        }
        
        fetch("/api/client-log", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            level: "INFO",
            message: `[LaboratoryPage] Parsing rawJson. length=${rawJson.length} Content: ${rawJson}`
          }),
        }).catch(() => {});

        const parsed = JSON.parse(rawJson);
        setSuggestedDichotomies(parsed.suggestedDichotomies || []);
        setSelectedDichotomies(parsed.suggestedDichotomies?.map((d: { id: string }) => d.id) || []);
        setCriteria(parsed.criteria || []);
        setWizardStep(2);
        setAnalyzeParseError(null);
      } catch (e) {
        console.error("Failed to parse analyze result:", e);
        fetch("/api/client-log", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            level: "ERROR",
            message: `[LaboratoryPage] Failed to parse analyze result: ${e}`
          }),
        }).catch(() => {});
        setAnalyzeParseError("Error al procesar la respuesta de la IA. Por favor, intentá de nuevo.");
      }
    }
  }, [analyzeChannel.result, analyzeChannel.loading]);

  useEffect(() => {
    if (briefingsChannel.result && !briefingsChannel.loading) {
      try {
        let rawJson = briefingsChannel.result.trim();
        const firstBrace = rawJson.indexOf("{");
        const lastBrace = rawJson.lastIndexOf("}");
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          rawJson = rawJson.substring(firstBrace, lastBrace + 1);
        } else if (rawJson.startsWith("```")) {
          rawJson = rawJson.replace(/^```[a-zA-Z-]*\n/, "").replace(/\n```$/, "");
        }
        const parsed = JSON.parse(rawJson);
        const briefings = parsed.briefings || {};

        const generatedStances: Stance[] = [];
        for (const [id, briefing] of Object.entries(briefings)) {
          generatedStances.push({
            id,
            name: id.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
            template: id.split("_")[0] || "",
            position: id.endsWith("_a") ? "A" : "B",
            briefing: briefing as string,
            icon: "User",
            color: "#3b82f6"
          });
        }

        setStances(generatedStances);

        const agentsList: Agent[] = generatedStances.map((s: Stance, i: number) => ({
          id: `agent_${i}`,
          name: s.name,
          role: `Especialista en ${s.name}`,
          stance: s,
          systemPrompt: s.briefing,
          model: defaultModel
        }));

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
            model: defaultModel,
            leader: true
          });
        }

        setCustomAgents(agentsList);
        setWizardStep(3);
        setBriefingsParseError(null);
      } catch (e) {
        console.error("Failed to parse briefings result:", e);
        setBriefingsParseError("Error al procesar los briefings generados. Por favor, intentá de nuevo.");
      }
    }
  }, [briefingsChannel.result, briefingsChannel.loading, defaultModel]);

  const handleAnalyzeTask = async () => {
    if (!wizardPrompt.trim() || !wizardName.trim()) return;
    setAnalyzeParseError(null);

    const systemPrompt = `You are an AI Architect. Analyze the project task and suggest:
1. The top 2 most relevant dichotomy templates from this catalog: ${JSON.stringify([
      { id: "cost_vs_quality", name: "Cost vs Quality", description: "Balance between minimizing costs and maximizing quality" },
      { id: "speed_vs_safety", name: "Speed vs Safety", description: "Fast delivery versus robust safety measures" },
      { id: "innovation_vs_reliability", name: "Innovation vs Reliability", description: "New tech versus proven solutions" },
      { id: "simplicity_vs_features", name: "Simplicity vs Features", description: "MVP minimalism versus full-featured product" }
    ])}
2. A list of 3-5 specific evaluation criteria for a scoring rubric.

Output ONLY a JSON object (no markdown fences):
{
  "suggestedDichotomies": [
    { "id": "template_id", "reason": "why relevant" }
  ],
  "criteria": ["Criterion 1", "Criterion 2", "Criterion 3"]
}`;

    try {
      await analyzeChannel.sendRequest({
        prompt: wizardPrompt,
        systemPrompt,
        model: defaultModel,
      });
    } catch (e) {
      console.error("Analyze task failed:", e);
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
    if (selectedDichotomies.length === 0) return;
    setBriefingsParseError(null);

    const systemPrompt = `You are an AI Prompt Engineer. For the given project task, generate custom agent briefings for the chosen roles/dichotomies.
Each briefing must be a detailed, 1-paragraph system prompt instruction explaining the role's point of view, priorities, arguments, and guidelines adapted specifically to the project task.

Output ONLY a JSON object matching this structure (no additional text, explanations, or code fences):
{
  "briefings": {
    "role_id": "Detailed 1-paragraph briefing adapted to the task..."
  }
}`;

    const prompt = `Project Task:
"${wizardPrompt}"

Roles to generate briefings for:
${JSON.stringify(selectedDichotomies.map(d => ({ id: d, name: d.replace(/_/g, " ") })))}`;

    try {
      await briefingsChannel.sendRequest({
        prompt,
        systemPrompt,
        model: defaultModel,
      });
    } catch (e) {
      console.error("Generate briefings failed:", e);
    }
  };

  const handleUpdateAgentPrompt = (id: string, text: string) => {
    setCustomAgents(prev => prev.map(a => a.id === id ? { ...a, systemPrompt: text } : a));
  };

  const handleUpdateAgentModel = (id: string, model: string) => {
    setCustomAgents(prev => prev.map(a => a.id === id ? { ...a, model } : a));
  };

  const handleSetAllModels = (model: string) => {
    setDefaultModel(model);
    setCustomAgents(prev => prev.map(a => ({ ...a, model })));
  };

  const buildExperimentBody = () => {
    const singleAgents: Agent[] = [
      {
        id: "baseline",
        name: "General Agent",
        role: "General Assistant",
        stance: stances[0] || { id: "general", name: "General", template: "", position: "A", briefing: "", icon: "", color: "" },
        systemPrompt: "Eres un asistente general de IA resolviendo la tarea de forma directa.",
        model: defaultModel
      }
    ];

    if (selectedBlueprintId) {
      return {
        name: wizardName,
        taskPrompt: wizardPrompt,
        blueprintId: selectedBlueprintId,
        autoEvaluate: true
      };
    }

    return {
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
  };

  const handleSave = async () => {
    try {
      const body = buildExperimentBody();
      const isEdit = wizardMode === "edit" && editingExpId;

      const res = await apiFetch(
        isEdit ? `/api/experiments/${editingExpId}` : "/api/experiments",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        }
      );

      if (res.ok) {
        const data = await res.json();
        const savedExp = data.experiment as Experiment;
        if (isEdit) {
          setExperiments((prev) => prev.map((e) => (e.id === savedExp.id ? savedExp : e)));
        } else {
          setExperiments((prev) => [savedExp, ...prev]);
        }
        setSelectedExpId(savedExp.id);
        setIsWizard(false);
        setWizardStep(1);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveAndRun = async () => {
    try {
      const body = buildExperimentBody();
      const isEdit = wizardMode === "edit" && editingExpId;

      const res = await apiFetch(
        isEdit ? `/api/experiments/${editingExpId}` : "/api/experiments",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        }
      );

      if (res.ok) {
        const data = await res.json();
        const savedExp = data.experiment as Experiment;
        if (isEdit) {
          setExperiments((prev) => prev.map((e) => (e.id === savedExp.id ? savedExp : e)));
        } else {
          setExperiments((prev) => [savedExp, ...prev]);
        }
        setSelectedExpId(savedExp.id);
        setIsWizard(false);
        setWizardStep(1);

        await apiFetch(`/api/experiments/${savedExp.id}/run`, { method: "POST" });
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

  const handleStop = async (expId: string) => {
    try {
      await apiFetch(`/api/experiments/${expId}/stop`, { method: "POST" });
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

  return (
    <div className="flex h-full min-h-0 bg-bg text-text-primary font-body">
      <ExperimentSidebar
        experiments={experiments}
        selectedExpId={selectedExpId}
        isWizard={isWizard}
        loadingExps={loadingExps}
        onSelectExperiment={(id) => {
          setSelectedExpId(id);
          setIsWizard(false);
        }}
        onOpenWizard={() => openWizard("create")}
        onDeleteExperiment={handleDeleteExp}
      />

      <div className="flex-1 min-w-0 bg-bg flex flex-col p-6 overflow-y-auto">
        <AnimatePresence mode="wait">
          {isWizard ? (
            <LaboratoryWizard
              wizardStep={wizardStep}
              setWizardStep={setWizardStep}
              wizardName={wizardName}
              setWizardName={setWizardName}
              wizardPrompt={wizardPrompt}
              setWizardPrompt={setWizardPrompt}
              blueprints={blueprints}
              selectedBlueprintId={selectedBlueprintId}
              onSelectBlueprint={handleSelectBlueprint}
              selectedBlueprint={selectedBlueprint}
              analyzeChannelLoading={analyzeChannel.loading}
              analyzeChannelText={analyzeChannel.text}
              analyzeChannelError={analyzeChannel.error || analyzeParseError}
              onAnalyzeTask={handleAnalyzeTask}
              onSaveBlueprint={handleSave}
              onSaveAndRunBlueprint={handleSaveAndRun}
              suggestedDichotomies={suggestedDichotomies}
              selectedDichotomies={selectedDichotomies}
              setSelectedDichotomies={setSelectedDichotomies}
              criteria={criteria}
              newCriterion={newCriterion}
              setNewCriterion={setNewCriterion}
              onAddCriterion={handleAddCriterion}
              onRemoveCriterion={handleRemoveCriterion}
              briefingsChannelLoading={briefingsChannel.loading}
              briefingsChannelText={briefingsChannel.text}
              briefingsChannelError={briefingsChannel.error || briefingsParseError}
              onGenerateStances={handleGenerateStances}
              customAgents={customAgents}
              defaultModel={defaultModel}
              defaultModelLoaded={defaultModelLoaded}
              onSetAllModels={handleSetAllModels}
              onUpdateAgentModel={handleUpdateAgentModel}
              onUpdateAgentPrompt={handleUpdateAgentPrompt}
              onCancel={() => {
                resetWizard();
                setIsWizard(false);
              }}
              onSave={handleSave}
              onSaveAndRun={handleSaveAndRun}
            />
          ) : activeExp ? (
            <div className="space-y-6 text-left">
              <ExperimentHeader
                activeExp={activeExp}
                onEditExperiment={(exp) => openWizard("edit", exp)}
                onDeleteExperiment={async (id) => {
                  const res = await apiFetch(`/api/experiments/${id}`, { method: "DELETE" });
                  if (res.ok) {
                    setExperiments(prev => prev.filter(e => e.id !== id));
                    setSelectedExpId(null);
                  }
                }}
                onTriggerRun={handleTriggerRun}
                onStop={handleStop}
              />

              <ComparativeMetrics activeExp={activeExp} />

              <ExperimentLiveView activeExp={activeExp} />
            </div>
          ) : (
            <div className="text-center py-20 bg-surface border border-surface-hover rounded-2xl">
              <svg className="mx-auto h-12 w-12 text-text-secondary/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4Z" />
              </svg>
              <h3 className="mt-2 text-sm font-semibold text-text-primary">Ningún experimento seleccionado</h3>
              <p className="mt-1 text-xs text-text-secondary">Selecciona un experimento del histórico o crea uno nuevo usando el configurador.</p>
              <div className="mt-6">
                <button
                  onClick={() => openWizard("create")}
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
