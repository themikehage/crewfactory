import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { ModelSelector } from "@/components/chat/ModelSelector";
import { motion } from "framer-motion";
import { useLiterals } from "@/lib";
import { literals as u } from "@/pages/LaboratoryPage.literals";
import type { AgentDefinition, CreateChannel } from "shared";
import type { Experiment } from "@/types/laboratory";
import { Button } from "@/components/ui/Button";

interface GeneratedTeam {
  agents: AgentDefinition[];
  channel: CreateChannel & { members: { agentId: string; replyMode: string; role: string }[] };
}

interface IaGeneratorProps {
  onExperimentCreated: (exp: Experiment) => void;
}

export function IaGenerator({ onExperimentCreated }: IaGeneratorProps) {
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

  // Experiment Config State (for Direct Experiment Creation)
  const [editorName, setEditorName] = useState("");
  const [editorCriteria, setEditorCriteria] = useState<string[]>([]);
  const [newCriterion, setNewCriterion] = useState("");

  // Initialize translated criteria when literales load
  useEffect(() => {
    if (l.workQuality) {
      setEditorCriteria([l.workQuality, l.efficiency, l.negotiation]);
    }
  }, [l]);

  // Load user default model
  useEffect(() => {
    const stored = localStorage.getItem("crewfy-selected-model");
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
      setEditorCriteria([l.workQuality || "Calidad", l.efficiency || "Eficiencia", l.negotiation || "Negociación"]);
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

  const handleSaveExperimentDirect = async () => {
    if (!editorName.trim() || !generatorPrompt.trim() || !editableTeam) return;

    const singleAgents = [
      {
        id: "baseline",
        name: editableTeam.agents[0]?.name || l.generalAgent || "General Agent",
        role: editableTeam.agents[0]?.role || l.generalAssistant || "General Assistant",
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
        onExperimentCreated(data.experiment as Experiment);
      }
    } catch (e) {
      console.error(l.saveExperimentError || "Error al guardar el experimento", e);
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
      name: l.newAgent || "New Agent",
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
    <div className="space-y-6 max-w-5xl mx-auto w-full">
      {/* Card Header del Generador */}
      <div className="bg-card border border-input rounded-2xl p-6 text-left">
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
            <Button
              onClick={handleGenerateTeam}
              disabled={generating || !generatorPrompt.trim()}
            >
              {generating ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  <span>Generando...</span>
                </>
              ) : (
                <span>Generar con IA</span>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Resultado del Generador (Editable) */}
      {editableTeam && (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="space-y-6 text-left"
        >
          <div className="flex justify-between items-center">
            <h2 className="text-sm font-bold text-foreground tracking-wide uppercase">Propuesta Generada (Editable)</h2>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleSaveExperimentDirect} disabled={editableTeam.agents.length < 3}>
                Crear Experimento
              </Button>
              <Button
                onClick={handleInstantiateTeam}
                disabled={instantiating || editableTeam.agents.length < 3}
              >
                {instantiating ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    <span>Instanciando...</span>
                  </>
                ) : (
                  <span>Instanciar Equipo Completo</span>
                )}
              </Button>
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
                <div className="border-t border-input pt-4 mt-2 space-y-2 text-left">
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
    </div>
  );
}
