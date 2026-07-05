import { useState, useEffect } from "react";
import { wsClient } from "@/lib/ws-client";

interface Props {
  toolCallId: string;
  args: {
    targetAgentId: string;
  };
  result: {
    content: Array<{ type: string; text?: string }>;
    isError: boolean;
  } | null;
  sessionId: string | null;
}

interface AgentData {
  id: string;
  name: string;
  role: string;
  systemPrompt?: string;
  model?: string;
}

interface ModelOption {
  id: string;
  name: string;
  provider: string;
}

export function AgentConfigCard({ toolCallId, args, result, sessionId }: Props) {
  const [loading, setLoading] = useState(true);
  const [localAction, setLocalAction] = useState<"confirm" | "cancel" | null>(null);
  const [agent, setAgent] = useState<AgentData | null>(null);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");

  const { targetAgentId } = args;
  const resolvedStatus = result?.content?.[0]?.text; // "configured" | "cancelled"
  const isResolved = !!resolvedStatus;

  useEffect(() => {
    const fetchData = async () => {
      try {
        const token = localStorage.getItem("token");
        // Cargar detalles del agente
        const agentRes = await fetch(`/api/agents/${targetAgentId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        
        // Cargar proveedores y modelos
        const provRes = await fetch("/api/providers", {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (agentRes.ok && provRes.ok) {
          const agentData = await agentRes.json();
          const provData = await provRes.json();

          setAgent(agentData);
          setSelectedModel(agentData.model || "");
          setSystemPrompt(agentData.systemPrompt || "");

          // Consolidar lista plana de modelos
          const list: ModelOption[] = [];
          provData.providers?.forEach((p: any) => {
            p.models?.forEach((m: any) => {
              list.push({
                id: m.id,
                name: m.name,
                provider: p.id,
              });
            });
          });
          setModels(list);
        }
      } catch (e) {
        console.error("Failed to fetch agent configuration requirements:", e);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [targetAgentId]);

  const handleAction = (action: "confirm" | "cancel") => {
    if (isResolved || !sessionId) return;
    setLocalAction(action);
    wsClient.send({
      type: "ui_action",
      sessionId,
      componentId: toolCallId,
      action,
      payload: action === "confirm" ? {
        model: selectedModel,
        systemPrompt,
      } : undefined,
    });
  };

  if (loading) {
    return (
      <div className="w-full max-w-sm rounded-xl border border-input/40 bg-card/40 p-4 font-sans shadow-md my-3 flex items-center justify-center h-48">
        <span className="text-xs text-muted-foreground/60 animate-pulse">Cargando configuración...</span>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="w-full max-w-sm rounded-xl border border-input/40 bg-card/40 p-4 font-sans shadow-md my-3 flex items-center justify-center h-24 text-xs text-error">
        No se pudo cargar la información del agente.
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm rounded-xl border border-input/40 bg-card/40 overflow-hidden font-sans shadow-md my-3 transition-colors">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-input/20">
        <div className="flex items-center gap-2 min-w-0">
          <svg className="w-4 h-4 text-accent shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <div className="min-w-0">
            <span className="text-xs text-muted-foreground font-mono truncate block">configure_agent_card</span>
            <span className="text-xs font-bold text-foreground truncate block">Configurar {agent.name}</span>
          </div>
        </div>

        {isResolved && (
          <div>
            {resolvedStatus === "configured" ? (
              <span className="text-[10px] font-bold text-accent bg-accent/10 border border-accent/20 px-2 py-0.5 rounded uppercase">
                Guardado
              </span>
            ) : (
              <span className="text-[10px] font-bold text-muted-foreground bg-muted border border-input px-2 py-0.5 rounded uppercase">
                Cancelado
              </span>
            )}
          </div>
        )}
      </div>

      {/* Body */}
      <div className="px-4 py-3 space-y-3">
        <div className="space-y-0.5">
          <span className="text-[9px] uppercase font-bold text-muted-foreground/60 tracking-wider block">Rol</span>
          <span className="text-xs font-medium text-foreground/80">{agent.role}</span>
        </div>

        {/* Model Selector */}
        <div className="space-y-1">
          <label className="block text-[10px] font-bold text-muted-foreground select-none">Modelo LLM</label>
          <select
            disabled={isResolved || localAction !== null}
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="w-full bg-bg text-xs text-foreground border border-input rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-accent disabled:opacity-50 transition-colors"
          >
            <option value="">Seleccionar modelo...</option>
            {models.map((m) => (
              <option key={`${m.provider}/${m.id}`} value={`${m.provider}/${m.id}`}>
                {m.provider} - {m.name} ({m.id})
              </option>
            ))}
          </select>
        </div>

        {/* System Prompt overrides */}
        <div className="space-y-1">
          <label className="block text-[10px] font-bold text-muted-foreground select-none">System Prompt</label>
          <textarea
            rows={3}
            disabled={isResolved || localAction !== null}
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            className="w-full bg-bg text-xs text-foreground border border-input rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-accent disabled:opacity-50 transition-colors resize-none placeholder:text-muted-foreground/45"
            placeholder="Instrucciones base de comportamiento del agente..."
          />
        </div>
      </div>

      {/* Actions */}
      {!isResolved && (
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-input/20 bg-card/20">
          <button
            onClick={() => handleAction("cancel")}
            disabled={localAction !== null}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-input text-foreground hover:bg-card-hover/80 transition-colors disabled:opacity-50 cursor-pointer"
          >
            {localAction === "cancel" ? "Cancelando..." : "Cancelar"}
          </button>
          <button
            onClick={() => handleAction("confirm")}
            disabled={localAction !== null}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-accent text-background hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer"
          >
            {localAction === "confirm" ? "Guardando..." : "Guardar cambios"}
          </button>
        </div>
      )}
    </div>
  );
}
