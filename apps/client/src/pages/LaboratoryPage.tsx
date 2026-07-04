import { useState, useEffect, useRef } from "react";
import { apiFetch } from "@/lib/api";
import { ModelSelector } from "@/components/chat/ModelSelector";
import { useChannel } from "@/hooks/useChannel";
import { ChannelMessageList } from "@/components/channels/ChannelMessageList";
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
  fetchExperiments: () => Promise<void>;
  isEditorOpen: boolean;
  setIsEditorOpen: (open: boolean) => void;
  editingExpId: string | null;
  setEditingExpId: (id: string | null) => void;
  handleDeleteExp: (id: string) => Promise<void>;
}

interface GeneratedTeam {
  agents: AgentDefinition[];
  channel: CreateChannel & { members: { agentId: string; replyMode: string; role: string }[] };
}

interface VariantViewerProps {
  experimentId: string;
  variantKey: "single" | "multiNoLeader" | "multiWithLeader";
  activeSessionId: string | null;
  status: string; // "pending" | "running" | "completed" | "failed"
  result: any;
}

function VariantViewer({ experimentId, variantKey, activeSessionId, status, result }: VariantViewerProps) {
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
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[560px] min-h-0 bg-surface/10 rounded-2xl border border-surface-hover/60 overflow-hidden">
      {/* Panel del Chat (70%) */}
      <div className="lg:col-span-2 flex flex-col h-full bg-surface/5 min-h-0 border-r border-surface-hover/40 relative">
        <div className="absolute inset-0 flex flex-col min-h-0">
          <div className="px-4 py-2.5 border-b border-surface-hover/30 bg-surface/10 flex items-center justify-between text-xs text-text-secondary">
            <span className="font-semibold tracking-wide">Conversación del Experimento (Lectura)</span>
            {status === "running" && (
              <span className="flex items-center gap-1.5 text-accent font-bold animate-pulse">
                <span className="w-2 h-2 bg-accent rounded-full animate-ping" />
                Debatiendo en vivo...
              </span>
            )}
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto bg-bg/25">
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
      <div className="p-5 flex flex-col bg-surface/10 min-h-0 overflow-y-auto text-left justify-between">
        <div className="space-y-6">
          <div>
            <h4 className="text-[10px] uppercase font-bold text-text-secondary tracking-wider block mb-2">
              Telemetría y Estado
            </h4>
            <div className="flex items-center justify-between bg-bg/50 border border-surface-hover/60 rounded-xl p-3.5">
              <span className="text-xs font-semibold text-text-primary">Estado de Corrida</span>
              <span
                className={`text-[9px] px-2 py-0.5 rounded-lg font-mono font-bold uppercase tracking-wider ${
                  status === "completed"
                    ? "bg-accent/10 text-accent border border-accent/20"
                    : status === "running"
                    ? "bg-blue-500/10 text-blue-400 border border-blue-400/20 animate-pulse"
                    : status === "failed"
                    ? "bg-error/10 text-error border border-error/20"
                    : "bg-bg text-text-secondary border border-surface-hover"
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
                  <h4 className="text-[10px] uppercase font-bold text-text-secondary tracking-wider">
                    Evaluación LLM-Judge
                  </h4>
                  <div className="bg-bg/40 border border-surface-hover/40 rounded-xl p-4 space-y-4">
                    <div className="flex flex-col items-center py-2">
                      <div className="relative w-20 h-20 flex items-center justify-center rounded-full bg-accent/5 border border-accent/25 shadow-[0_0_15px_rgba(74,222,128,0.05)]">
                        <span className="text-2xl font-black text-accent">{result.scores.globalScore}</span>
                      </div>
                      <span className="text-[10px] font-bold text-text-secondary uppercase tracking-wider mt-2.5">
                        Global Score
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-2 border-t border-surface-hover/30">
                      <div className="text-center p-2 bg-bg/25 rounded-lg border border-surface-hover/30">
                        <p className="text-[9px] text-text-secondary font-bold uppercase">Calidad</p>
                        <p className="text-base font-black text-text-primary mt-0.5">{result.scores.taskQuality}</p>
                      </div>
                      <div className="text-center p-2 bg-bg/25 rounded-lg border border-surface-hover/30">
                        <p className="text-[9px] text-text-secondary font-bold uppercase">Eficiencia</p>
                        <p className="text-base font-black text-text-primary mt-0.5">{result.scores.efficiencyScore}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Estadísticas */}
              <div className="space-y-3">
                <h4 className="text-[10px] uppercase font-bold text-text-secondary tracking-wider">
                  Métricas de Ejecución
                </h4>
                <div className="bg-bg/40 border border-surface-hover/40 rounded-xl p-3.5 space-y-2.5 text-xs font-mono text-text-secondary leading-relaxed">
                  <div className="flex justify-between">
                    <span>Duración:</span>
                    <span className="text-text-primary font-bold">{(result.durationMs / 1000).toFixed(1)}s</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Tokens entrada:</span>
                    <span className="text-text-primary">{result.tokensIn}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Tokens salida:</span>
                    <span className="text-text-primary">{result.tokensOut}</span>
                  </div>
                  {result.negotiationRounds !== undefined && (
                    <div className="flex justify-between">
                      <span>Rondas debate:</span>
                      <span className="text-text-primary">{result.negotiationRounds}</span>
                    </div>
                  )}
                  {result.escalationsToLeader !== undefined && (
                    <div className="flex justify-between">
                      <span>Escalaciones:</span>
                      <span className="text-text-primary">{result.escalationsToLeader}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Mostrar resultado final textual (o error) */}
              {result.finalOutput && (
                <div className="space-y-2">
                  <h4 className="text-[10px] uppercase font-bold text-text-secondary tracking-wider">
                    {result.status === "failed" ? "Detalle del Error" : "Resultado Final"}
                  </h4>
                  <pre className={`text-[10px] border rounded-xl p-3 max-h-32 overflow-y-auto whitespace-pre-wrap font-mono text-left leading-relaxed ${
                    result.status === "failed" 
                      ? "bg-error/5 text-error border-error/20" 
                      : "bg-bg/30 text-text-secondary border-surface-hover"
                  }`}>
                    {result.finalOutput}
                  </pre>
                </div>
              )}
            </div>
          ) : (
            status === "running" ? (
              <div className="flex-1 flex flex-col items-center justify-center py-16 text-center text-xs text-text-secondary space-y-3">
                <div className="w-8 h-8 border-3 border-accent border-t-transparent rounded-full animate-spin" />
                <span className="font-semibold tracking-wide text-accent">Debate en progreso...</span>
                <span className="text-[10px] text-text-secondary/70 max-w-[200px]">
                  Los agentes están analizando y colaborando en tiempo real. Seguí la conversación a la izquierda.
                </span>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center py-16 text-center text-xs text-text-secondary/50 italic bg-bg/20 rounded-xl border border-dashed border-surface-hover/60">
                Esperando el inicio de la corrida...
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}

export function LaboratoryPage({
  onNavigate: _onNavigate,
  selectedExpId,
  setSelectedExpId,
  experiments,
  setExperiments,
  fetchExperiments,
  isEditorOpen,
  setIsEditorOpen,
  editingExpId,
  setEditingExpId,
  handleDeleteExp,
}: Props) {
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
  const [editorCriteria, setEditorCriteria] = useState<string[]>(["Calidad del Trabajo", "Eficiencia", "Negociación"]);
  const [newCriterion, setNewCriterion] = useState("");
  const [editorVariants, setEditorVariants] = useState<any | null>(null);

  // Dynamic Run Prompt Modal State
  const [isRunPromptModalOpen, setIsRunPromptModalOpen] = useState(false);
  const [runPromptValue, setRunPromptValue] = useState("");
  const [runningExpId, setRunningExpId] = useState<string | null>(null);

  // Active Variant Tab
  const [activeVariantTab, setActiveVariantTab] = useState<"single" | "multiNoLeader" | "multiWithLeader">("single");

  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const activeExp = experiments.find((e) => e.id === selectedExpId) || null;

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
  }, [selectedExpId]);

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
      setEditorCriteria(["Calidad del Trabajo", "Eficiencia", "Negociación"]);
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

  const handleConfirmRun = async () => {
    if (!runningExpId) return;
    setIsRunPromptModalOpen(false);

    try {
      // 1. Actualizar el prompt de la tarea específica en el experimento
      const resPatch = await apiFetch(`/api/experiments/${runningExpId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskPrompt: runPromptValue })
      });

      if (!resPatch.ok) {
        throw new Error("Failed to update task prompt before execution");
      }

      const dataPatch = await resPatch.json();
      const updatedExp = dataPatch.experiment as Experiment;
      setExperiments((prev) => prev.map((e) => (e.id === updatedExp.id ? updatedExp : e)));

      // 2. Disparar ejecución
      await apiFetch(`/api/experiments/${runningExpId}/run`, { method: "POST" });
      fetchExperiments();
    } catch (e) {
      console.error("Failed to run experiment with custom prompt:", e);
    } finally {
      setRunningExpId(null);
    }
  };

  const handleStopRun = async (expId: string) => {
    try {
      await apiFetch(`/api/experiments/${expId}/stop`, { method: "POST" });
      fetchExperiments();
    } catch (e) {
      console.error("Failed to stop experiment:", e);
    }
  };

  const handleSaveExperiment = async () => {
    if (!editorName.trim() || !editorPrompt.trim()) return;

    const isEdit = !!editingExpId;
    const body = {
      name: editorName,
      taskPrompt: editorPrompt,
      criteria: editorCriteria,
      autoEvaluate: true,
      variants: editorVariants || undefined
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
      console.error("Failed to save experiment:", e);
    }
  };

  const openEditModal = (exp: Experiment) => {
    setEditingExpId(exp.id);
    setEditorName(exp.name);
    setEditorPrompt(exp.taskPrompt);
    setEditorCriteria(exp.judge?.criteria || ["Calidad", "Eficiencia"]);
    setEditorVariants(null); // mantendrá las variantes existentes en base de datos
    setIsEditorOpen(true);
  };

  const handleSaveExperimentDirect = async () => {
    if (!editorName.trim() || !generatorPrompt.trim() || !editableTeam) return;

    const singleAgents = [
      {
        id: "baseline",
        name: editableTeam.agents[0]?.name || "General Agent",
        role: editableTeam.agents[0]?.role || "General Assistant",
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
      console.error("Failed to save experiment:", e);
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
      name: "Nuevo Agente",
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
    <div className="flex h-full min-h-0 bg-bg text-text-primary font-body">
      {/* Area Principal de Contenido (Abarca todo el ancho de la página al quitar el sidebar) */}
      <div className="flex-1 min-w-0 bg-bg flex flex-col p-6 overflow-y-auto">
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
              <div className="bg-surface border border-surface-hover rounded-2xl p-6">
                <div className="flex items-center gap-2 mb-2">
                  <span className="p-2 bg-accent/10 rounded-xl">
                    <svg className="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
                    <p className="text-xs text-text-secondary">
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
                    className="w-full bg-bg border border-surface-hover rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent transition-colors font-body text-text-primary"
                  />

                  {genError && (
                    <div className="p-3 bg-error/10 border border-error/20 text-error rounded-xl text-xs flex items-center gap-2">
                      <span className="font-bold">Error:</span> {genError}
                    </div>
                  )}

                  {instantiationSuccess && (
                    <div className="p-3 bg-accent/10 border border-accent/20 text-accent rounded-xl text-xs flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                      </svg>
                      <span>¡Equipo instanciado y cargado con éxito en el workspace!</span>
                    </div>
                  )}

                  {/* Selector de Modelo al lado del botón de generar */}
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mt-4 bg-bg/40 p-3 rounded-xl border border-surface-hover/50">
                    <div className="flex items-center gap-2.5">
                      <span className="text-[10px] uppercase font-bold text-text-secondary tracking-wider font-mono">
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
                      className="w-full sm:w-auto px-4 py-2 bg-accent text-bg hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-xs font-bold transition-all shadow flex items-center justify-center gap-2 cursor-pointer"
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
                    <h2 className="text-sm font-bold text-text-primary tracking-wide uppercase">Propuesta Generada (Editable)</h2>
                    <div className="flex gap-2">
                      <button
                        onClick={handleSaveExperimentDirect}
                        disabled={editableTeam.agents.length < 3}
                        className="px-4 py-1.5 bg-surface hover:bg-surface-hover border border-surface-hover text-text-primary disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-xs font-bold transition-all cursor-pointer"
                      >
                        Crear Experimento
                      </button>
                      <button
                        onClick={handleInstantiateTeam}
                        disabled={instantiating || editableTeam.agents.length < 3}
                        className="px-4 py-1.5 bg-accent text-bg hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-xs font-bold transition-all shadow flex items-center gap-2 cursor-pointer"
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
                      <p className="text-text-secondary leading-relaxed">
                        Se requiere un mínimo de <strong>3 agentes</strong> para poder ejecutar los tracks colaborativos (Colaboración Horizontal y Colaboración Jerárquica). Agregá más agentes al equipo para cumplir con esta regla.
                      </p>
                    </div>
                  )}

                  {/* Creador de Experimento Directo (Unificado) */}
                  <div className="bg-surface border border-surface-hover rounded-2xl p-5 space-y-4 text-left">
                    <div className="flex items-center gap-2 pb-2 border-b border-surface-hover/50">
                      <span className="p-1.5 bg-accent/10 rounded-lg text-accent">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                      </span>
                      <h3 className="font-bold text-xs uppercase tracking-wider text-text-primary">Configuración del Experimento</h3>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="text-[10px] uppercase font-bold text-text-secondary tracking-wider block mb-1">
                          Nombre del Experimento
                        </label>
                        <input
                          type="text"
                          value={editorName}
                          onChange={(e) => setEditorName(e.target.value)}
                          className="w-full bg-bg border border-surface-hover rounded-xl px-3 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent font-semibold"
                          placeholder="Nombre del experimento..."
                        />
                      </div>
                      <div>
                        <label className="text-[10px] uppercase font-bold text-text-secondary tracking-wider block mb-1">
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
                            className="flex-1 bg-bg border border-surface-hover rounded-lg px-2.5 py-1 text-xs focus:outline-none focus:border-accent text-text-primary"
                          />
                          <button
                            onClick={handleAddCriterion}
                            className="px-2.5 py-1 bg-bg border border-surface-hover hover:bg-surface-hover rounded-lg text-xs font-bold cursor-pointer"
                          >
                            +
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {editorCriteria.map((c, i) => (
                            <span
                              key={i}
                              className="text-[9px] px-2 py-0.5 bg-bg border border-surface-hover rounded text-text-secondary flex items-center gap-1.5"
                            >
                              <span>{c}</span>
                              <button
                                onClick={() => handleRemoveCriterion(i)}
                                className="text-error hover:text-error/85 font-bold cursor-pointer"
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
                    <div className="bg-surface border border-surface-hover rounded-2xl p-5 lg:col-span-1 flex flex-col justify-between">
                      <div className="space-y-4">
                        <div className="flex items-center gap-2 mb-1 border-b border-surface-hover/50 pb-2">
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
                          <h3 className="font-bold text-xs text-text-primary uppercase tracking-wider">Ajustes del Canal</h3>
                        </div>

                        <div>
                          <label className="text-[10px] uppercase font-bold text-text-secondary tracking-wider block mb-1">
                            Nombre del Canal
                          </label>
                          <input
                            type="text"
                            value={editableTeam.channel.name}
                            onChange={(e) => handleUpdateChannelField("name", e.target.value)}
                            className="w-full bg-bg border border-surface-hover rounded-xl px-3 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent font-semibold"
                          />
                        </div>

                        <div>
                          <label className="text-[10px] uppercase font-bold text-text-secondary tracking-wider block mb-1">
                            Descripción
                          </label>
                          <textarea
                            value={editableTeam.channel.description || ""}
                            onChange={(e) => handleUpdateChannelField("description", e.target.value)}
                            rows={3}
                            className="w-full bg-bg border border-surface-hover rounded-xl px-3 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent leading-relaxed"
                          />
                        </div>

                        <div className="flex justify-between items-center text-xs">
                          <span className="text-text-secondary font-medium">Límite de debate:</span>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              min={1}
                              max={20}
                              value={editableTeam.channel.maxChainDepth || 5}
                              onChange={(e) => handleUpdateChannelField("maxChainDepth", parseInt(e.target.value) || 5)}
                              className="w-14 bg-bg border border-surface-hover rounded-lg px-2 py-0.5 text-xs font-mono text-text-primary focus:outline-none focus:border-accent text-center"
                            />
                            <span className="text-text-secondary">rondas</span>
                          </div>
                        </div>

                        {/* Variables de Contexto KV del Canal */}
                        <div className="border-t border-surface-hover pt-4 mt-2 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] uppercase font-bold text-text-secondary tracking-wider font-mono">
                              Contexto KV
                            </span>
                            <button
                              onClick={handleAddContextItem}
                              className="text-[10px] text-accent hover:underline font-bold cursor-pointer"
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
                                  className="flex-1 min-w-0 bg-bg border border-surface-hover rounded px-2 py-0.5 text-[10px] text-text-primary font-mono focus:outline-none focus:border-accent"
                                />
                                <input
                                  type="text"
                                  placeholder="Valor"
                                  value={ctx.value}
                                  onChange={(e) => handleUpdateContextItem(idx, ctx.key, e.target.value)}
                                  className="flex-1 min-w-0 bg-bg border border-surface-hover rounded px-2 py-0.5 text-[10px] text-text-primary focus:outline-none focus:border-accent"
                                />
                                <button
                                  onClick={() => handleRemoveContextItem(idx)}
                                  className="text-error hover:text-error/80 font-bold px-1.5 cursor-pointer text-xs"
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                            {(editableTeam.channel.context || []).length === 0 && (
                              <span className="text-[10px] text-text-secondary/50 block italic py-2">
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
                            className="bg-surface border border-surface-hover rounded-2xl p-5 flex flex-col gap-4 hover:border-accent/10 transition-colors"
                          >
                            <div className="flex flex-col sm:flex-row gap-4 justify-between items-start border-b border-surface-hover/40 pb-3">
                              {/* Identificación del Agente */}
                              <div className="grid grid-cols-2 gap-3 flex-1 w-full">
                                <div>
                                  <label className="text-[9px] uppercase font-bold text-text-secondary tracking-wider block mb-1">
                                    Nombre del Agente
                                  </label>
                                  <input
                                    type="text"
                                    value={ag.name}
                                    onChange={(e) => handleUpdateAgentField(ag.id, "name", e.target.value)}
                                    className="w-full bg-bg border border-surface-hover rounded-xl px-3 py-1 text-xs text-text-primary focus:outline-none focus:border-accent font-semibold"
                                  />
                                </div>
                                <div>
                                  <label className="text-[9px] uppercase font-bold text-text-secondary tracking-wider block mb-1">
                                    ID (Kebab-case)
                                  </label>
                                  <input
                                    type="text"
                                    value={ag.id}
                                    onChange={(e) => handleUpdateAgentId(ag.id, e.target.value)}
                                    className="w-full bg-bg border border-surface-hover rounded-xl px-3 py-1 text-xs text-text-primary focus:outline-none focus:border-accent font-mono"
                                  />
                                </div>
                              </div>

                              {/* Roles y Modos del Miembro del Canal */}
                              {mInfo && (
                                <div className="flex gap-2 w-full sm:w-auto items-end">
                                  <div className="flex-1 sm:flex-initial">
                                    <label className="text-[9px] uppercase font-bold text-text-secondary tracking-wider block mb-1">
                                      Rol Canal
                                    </label>
                                    <select
                                      value={mInfo.role || "member"}
                                      onChange={(e) => handleUpdateMemberRole(ag.id, e.target.value)}
                                      className="w-full bg-bg border border-surface-hover rounded-xl px-2.5 py-1 text-xs text-text-primary focus:outline-none focus:border-accent cursor-pointer"
                                    >
                                      <option value="member">Member</option>
                                      <option value="lead">Lead</option>
                                      <option value="senior">Senior</option>
                                      <option value="observer">Observer</option>
                                    </select>
                                  </div>

                                  <div className="flex-1 sm:flex-initial">
                                    <label className="text-[9px] uppercase font-bold text-text-secondary tracking-wider block mb-1">
                                      Reply Mode
                                    </label>
                                    <select
                                      value={mInfo.replyMode}
                                      disabled={mInfo.role === "lead"}
                                      onChange={(e) => handleUpdateMemberReplyMode(ag.id, e.target.value)}
                                      className="w-full bg-bg border border-surface-hover rounded-xl px-2.5 py-1 text-xs text-text-primary focus:outline-none focus:border-accent disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
                                    >
                                      <option value="mention-only">Mention Only</option>
                                      <option value="broadcast">Broadcast</option>
                                      <option value="targeted">Targeted</option>
                                      <option value="user-only">User Only</option>
                                    </select>
                                  </div>

                                  <button
                                    onClick={() => handleRemoveAgent(ag.id)}
                                    className="p-2 bg-error/10 hover:bg-error/20 border border-error/20 hover:border-error/45 text-error rounded-xl text-xs font-bold transition-all cursor-pointer h-[30px] flex items-center justify-center aspect-square"
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
                                <label className="text-[9px] uppercase font-bold text-text-secondary tracking-wider block mb-1">
                                  Propósito (Role)
                                </label>
                                <input
                                  type="text"
                                  value={ag.role}
                                  onChange={(e) => handleUpdateAgentField(ag.id, "role", e.target.value)}
                                  className="w-full bg-bg border border-surface-hover rounded-xl px-3 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent font-medium font-mono"
                                />
                              </div>

                              <div>
                                <label className="text-[9px] uppercase font-bold text-text-secondary tracking-wider block mb-1">
                                  System Prompt (Instrucciones)
                                </label>
                                <textarea
                                  value={ag.systemPrompt}
                                  onChange={(e) => handleUpdateAgentField(ag.id, "systemPrompt", e.target.value)}
                                  rows={4}
                                  className="w-full bg-bg border border-surface-hover rounded-xl px-3 py-2 text-xs text-text-primary focus:outline-none focus:border-accent leading-relaxed font-mono"
                                />
                              </div>

                              {/* Modelo del Agente */}
                              <div className="flex items-center gap-2 bg-bg/30 px-3 py-2 rounded-xl border border-surface-hover/30">
                                <span className="text-[9px] uppercase font-bold text-text-secondary tracking-wider font-mono">
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
                        className="w-full py-4 border border-dashed border-surface-hover hover:border-accent/40 rounded-2xl flex items-center justify-center gap-2 text-xs text-text-secondary hover:text-accent transition-all cursor-pointer bg-surface/5 hover:bg-surface/10 font-bold"
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
              className="space-y-6 text-left max-w-5xl mx-auto w-full flex flex-col h-full min-h-0"
            >
              {/* Cabecera del Experimento */}
              <div className="bg-surface border border-surface-hover rounded-2xl p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 flex-shrink-0">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="p-1 bg-accent/10 rounded text-accent">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                        />
                      </svg>
                    </span>
                    <h1 className="text-base font-bold text-text-primary">{activeExp.name}</h1>
                  </div>
                  <p className="text-xs text-text-secondary leading-relaxed max-w-2xl">{activeExp.taskPrompt}</p>
                </div>

                <div className="flex gap-2 flex-shrink-0">
                  {activeExp.status !== "running" ? (
                    <>
                      <button
                        onClick={() => openEditModal(activeExp)}
                        className="px-3 py-1.5 bg-bg hover:bg-bg/85 border border-surface-hover text-text-primary rounded-xl text-xs font-bold transition-all cursor-pointer"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => handleDeleteExp(activeExp.id)}
                        className="px-3 py-1.5 bg-bg hover:bg-error/10 border border-surface-hover hover:border-error/30 text-error rounded-xl text-xs font-bold transition-all cursor-pointer"
                      >
                        Eliminar
                      </button>
                      <button
                        onClick={() => {
                          setRunningExpId(activeExp.id);
                          setRunPromptValue(activeExp.taskPrompt);
                          setIsRunPromptModalOpen(true);
                        }}
                        className="px-4 py-1.5 bg-accent text-bg hover:bg-accent/90 rounded-xl text-xs font-bold transition-all shadow flex items-center gap-1.5 cursor-pointer"
                      >
                        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                        Ejecutar
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => handleStopRun(activeExp.id)}
                      className="px-4 py-1.5 bg-error hover:bg-error/90 text-white rounded-xl text-xs font-bold transition-all shadow flex items-center gap-1.5 cursor-pointer"
                    >
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                      </svg>
                      Detener Corrida
                    </button>
                  )}
                </div>
              </div>

              {/* Rúbrica y Criterios */}
              {activeExp.judge?.criteria && (
                <div className="bg-surface border border-surface-hover rounded-2xl p-5 flex-shrink-0">
                  <h3 className="text-xs font-bold text-text-primary uppercase tracking-wider mb-2.5">
                    Rúbrica de Evaluación
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {activeExp.judge.criteria.map((c, i) => (
                      <span
                        key={i}
                        className="text-xs px-3 py-1 bg-bg border border-surface-hover rounded-xl text-text-secondary"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Selector de Pestañas de Variante */}
              <div className="flex border-b border-surface-hover/40 gap-1 flex-shrink-0 mt-2">
                {(["single", "multiNoLeader", "multiWithLeader"] as const).map((vKey) => {
                  const label =
                    vKey === "single"
                      ? "Baseline (Un Agente)"
                      : vKey === "multiNoLeader"
                      ? "Colaboración Horizontal"
                      : "Colaboración Jerárquica";
                  const isActive = activeVariantTab === vKey;
                  const runData = activeExp.variants?.[vKey];
                  const hasResult = !!runData?.result;
                  const isRunning = activeExp.status === "running" && runData?.activeSessionId && !hasResult;

                  return (
                    <button
                      key={vKey}
                      onClick={() => setActiveVariantTab(vKey)}
                      className={`px-4 py-2.5 text-xs font-semibold border-b-2 -mb-[1px] transition-all flex items-center gap-1.5 cursor-pointer ${
                        isActive
                          ? "text-accent border-accent font-bold"
                          : "text-text-secondary border-transparent hover:text-text-primary hover:border-surface-hover"
                      }`}
                    >
                      {label}
                      {isRunning && (
                        <span className="w-1.5 h-1.5 rounded-full bg-accent animate-ping" />
                      )}
                      {hasResult && (
                        <span className={`w-1.5 h-1.5 rounded-full ${runData.result?.status === "completed" ? "bg-accent" : "bg-error"}`} />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Visor de la Variante Activa */}
              <div className="flex-1 min-h-0">
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
                />
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex-1 flex flex-col items-center justify-center text-center p-12"
            >
              <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-xs text-text-secondary">Cargando detalles del experimento...</p>
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
            className="bg-surface border border-surface-hover rounded-2xl w-full max-w-xl p-6 space-y-4 shadow-2xl text-left"
          >
            <div>
              <h3 className="text-sm font-bold text-text-primary tracking-wide uppercase">
                {editingExpId ? "Editar Experimento" : "Nuevo Experimento"}
              </h3>
              <p className="text-[11px] text-text-secondary">
                Diseñá tu caso de prueba y configurá los criterios del LLM-Judge para evaluar las variantes.
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] uppercase font-bold text-text-secondary tracking-wider block mb-1">
                  Nombre del Experimento
                </label>
                <input
                  type="text"
                  value={editorName}
                  onChange={(e) => setEditorName(e.target.value)}
                  placeholder="Ej: Benchmark Traducción de Código"
                  className="w-full bg-bg border border-surface-hover rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-accent text-text-primary"
                />
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-text-secondary tracking-wider block mb-1">
                  Prompt de Tarea (Task Prompt)
                </label>
                <textarea
                  value={editorPrompt}
                  onChange={(e) => setEditorPrompt(e.target.value)}
                  placeholder="Ej: Escribe un script en Python que calcule el factorial de un número usando recursividad."
                  rows={4}
                  className="w-full bg-bg border border-surface-hover rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-accent text-text-primary font-mono"
                />
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-text-secondary tracking-wider block mb-1">
                  Criterios de Evaluación
                </label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={newCriterion}
                    onChange={(e) => setNewCriterion(e.target.value)}
                    placeholder="Ej: Completitud"
                    className="flex-1 bg-bg border border-surface-hover rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-accent text-text-primary"
                  />
                  <button
                    onClick={handleAddCriterion}
                    className="px-3 py-2 bg-bg border border-surface-hover hover:bg-surface-hover rounded-xl text-xs font-bold text-text-primary cursor-pointer"
                  >
                    Agregar
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {editorCriteria.map((c, i) => (
                    <span
                      key={i}
                      className="text-[10px] px-2.5 py-1 bg-bg border border-surface-hover rounded-lg text-text-secondary flex items-center gap-1.5"
                    >
                      <span>{c}</span>
                      <button
                        onClick={() => handleRemoveCriterion(i)}
                        className="text-error hover:text-error/80 font-bold cursor-pointer"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-surface-hover/50 pt-4">
              <button
                onClick={() => setIsEditorOpen(false)}
                className="px-4 py-2 bg-bg border border-surface-hover hover:bg-surface-hover rounded-xl text-xs font-bold text-text-primary cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveExperiment}
                disabled={!editorName.trim() || !editorPrompt.trim()}
                className="px-4 py-2 bg-accent text-bg hover:bg-accent/90 disabled:opacity-50 rounded-xl text-xs font-bold transition-all shadow cursor-pointer"
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
            className="bg-surface border border-surface-hover rounded-2xl w-full max-w-xl p-6 space-y-4 shadow-2xl text-left"
          >
            <div>
              <h3 className="text-sm font-bold text-text-primary tracking-wide uppercase">
                Iniciar Corrida de Experimento
              </h3>
              <p className="text-[11px] text-text-secondary">
                Ingresá la tarea específica (prompt) sobre la cual querés que debata y resuelva la tripulación en esta ejecución.
              </p>
            </div>

            <div>
              <label className="text-[10px] uppercase font-bold text-text-secondary tracking-wider block mb-1">
                Tarea / Prompt de Ejecución
              </label>
              <textarea
                value={runPromptValue}
                onChange={(e) => setRunPromptValue(e.target.value)}
                placeholder="Ej: Escribe un script en Python que busque imágenes en un directorio usando glob y PIL."
                rows={5}
                className="w-full bg-bg border border-surface-hover rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-accent text-text-primary font-mono leading-relaxed"
              />
            </div>

            <div className="flex justify-end gap-2 border-t border-surface-hover/50 pt-4">
              <button
                onClick={() => {
                  setIsRunPromptModalOpen(false);
                  setRunningExpId(null);
                }}
                className="px-4 py-2 bg-bg border border-surface-hover hover:bg-surface-hover rounded-xl text-xs font-bold text-text-primary cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmRun}
                disabled={!runPromptValue.trim()}
                className="px-4 py-2 bg-accent text-bg hover:bg-accent/90 disabled:opacity-50 rounded-xl text-xs font-bold transition-all shadow cursor-pointer"
              >
                Confirmar y Ejecutar
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
