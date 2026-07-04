import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAgents } from "@/hooks/useAgents";
import type { AgentDefinition, AgentInfo } from "shared";

const STATUS_COLORS: Record<string, string> = {
  starting: "text-warning bg-warning/10 border-warning/30",
  idle: "text-primary bg-primary/10 border-primary/30",
  streaming: "text-blue-400 bg-blue-400/10 border-blue-400/30",
  error: "text-destructive bg-destructive/10 border-error/30",
  stopped: "text-muted-foreground bg-card border-input",
};

const STATUS_DOT: Record<string, string> = {
  starting: "bg-warning animate-pulse",
  idle: "bg-primary",
  streaming: "bg-blue-400 animate-pulse",
  error: "bg-destructive",
  stopped: "bg-text-secondary",
};

const ROLE_COLORS: Record<string, string> = {
  "web-builder": "text-purple-400 bg-purple-400/10 border-purple-400/20",
  researcher: "text-sky-400 bg-sky-400/10 border-sky-400/20",
  supervisor: "text-amber-400 bg-amber-400/10 border-amber-400/20",
  default: "text-muted-foreground bg-card border-input",
};

function roleColor(role: string) {
  return ROLE_COLORS[role] ?? ROLE_COLORS.default;
}

const DEFAULT_FORM: AgentDefinition = {
  id: "",
  name: "",
  role: "",
  systemPrompt: "",
  model: "",
  skills: [],
  port: undefined,
};

function AgentCard({
  agent,
  onDelete,
  onEdit,
  onChat,
  onExecutions,
}: {
  agent: AgentInfo;
  onDelete: (id: string) => void;
  onEdit: (agent: AgentInfo) => void;
  onChat: (agent: { id: string; name: string }) => void;
  onExecutions: (agent: { id: string; name: string }) => void;
}) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (
      !window.confirm(
        `¿Estás seguro de que querés eliminar al agente "${agent.name}"? Esto detendrá su servidor y eliminará todas sus sesiones de chat asociadas de manera permanente.`
      )
    ) {
      return;
    }
    setDeleting(true);
    try {
      await onDelete(agent.id);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.2 }}
      className="bg-card border border-input rounded-xl p-4 flex flex-col gap-3 hover:border-primary/20 transition-colors"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
            <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" className="text-primary">
              <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="font-medium text-foreground text-sm truncate">{agent.name}</p>
            <p className="text-muted-foreground text-xs font-mono truncate">{agent.id}</p>
          </div>
        </div>
        <span
          className={`text-[10px] font-medium px-2 py-0.5 rounded-full border flex-shrink-0 ${
            STATUS_COLORS[agent.status] ?? STATUS_COLORS.stopped
          }`}
        >
          <span className="flex items-center gap-1">
            <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[agent.status] ?? "bg-text-secondary"}`} />
            {agent.status}
          </span>
        </span>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${roleColor(agent.role)}`}>
          {agent.role}
        </span>
        {agent.port && (
          <span className="text-[10px] font-mono text-muted-foreground bg-background border border-input px-2 py-0.5 rounded-full">
            :{agent.port}
          </span>
        )}
        <span className="text-[10px] text-muted-foreground ml-auto">
          {new Date(agent.createdAt).toLocaleTimeString()}
        </span>
      </div>

      <div className="flex items-center gap-2 mt-1">
        <button
          onClick={() => onChat({ id: agent.id, name: agent.name })}
          disabled={agent.status === "stopped" || agent.status === "error"}
          className="flex-1 py-1.5 px-2 text-[11px] font-medium bg-primary/10 text-primary border border-primary/20 rounded-lg hover:bg-primary/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Chat
        </button>
        <button
          onClick={() => onExecutions({ id: agent.id, name: agent.name })}
          className="flex-1 py-1.5 px-2 text-[11px] font-medium bg-card-hover text-foreground border border-input rounded-lg hover:bg-card-hover/80 transition-colors"
        >
          Historial
        </button>
        <button
          onClick={() => onEdit(agent)}
          className="py-1.5 px-2 text-[11px] font-medium text-blue-400 border border-blue-400/20 rounded-lg hover:bg-blue-400/10 transition-colors"
        >
          Editar
        </button>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="py-1.5 px-2 text-[11px] font-medium text-destructive border border-error/20 rounded-lg hover:bg-destructive/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {deleting ? "Eliminando..." : "Eliminar"}
        </button>
      </div>
    </motion.div>
  );
}

function RegisterModal({
  agent,
  onClose,
  onSubmit,
}: {
  agent?: AgentInfo | null;
  onClose: () => void;
  onSubmit: (def: AgentDefinition) => Promise<unknown>;
}) {
  const [form, setForm] = useState<AgentDefinition>(DEFAULT_FORM);
  const [skillsInput, setSkillsInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (agent) {
      const fetchDetail = async () => {
        try {
          const token = localStorage.getItem("token");
          const res = await fetch(`/api/agents/${agent.id}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            const data = await res.json();
            if (data.definition) {
              setForm(data.definition);
              setSkillsInput(data.definition.skills?.join(", ") || "");
            }
          }
        } catch (err) {
          console.error("Failed to load agent detail:", err);
        }
      };
      fetchDetail();
    }
  }, [agent]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const def: AgentDefinition = {
        ...form,
        id: form.id.trim().toLowerCase().replace(/\s+/g, "-"),
        skills: skillsInput
          ? skillsInput
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : undefined,
        model: form.model?.trim() || undefined,
        port: form.port || undefined,
      };
      await onSubmit(def);
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to save agent");
    } finally {
      setSubmitting(false);
    }
  };

  const set = (key: keyof AgentDefinition) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 8 }}
        transition={{ duration: 0.18 }}
        className="relative w-full max-w-lg bg-card border border-input rounded-2xl shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-input">
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              {agent ? "Editar Agente" : "Register Agent"}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {agent ? "Modificá la configuración del agente" : "Define a new programmatic agent"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-card-hover transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-3 max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">ID *</label>
              <input
                required
                disabled={!!agent}
                value={form.id}
                onChange={set("id")}
                placeholder="web-builder"
                pattern="[a-z0-9-]+"
                title="lowercase letters, numbers, and dashes only"
                className="w-full bg-background border border-input rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/50 font-mono disabled:opacity-50"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Name *</label>
              <input
                required
                value={form.name}
                onChange={set("name")}
                placeholder="Web Builder"
                className="w-full bg-background border border-input rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/50"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Role *</label>
              <input
                required
                value={form.role}
                onChange={set("role")}
                placeholder="web-builder"
                className="w-full bg-background border border-input rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/50"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Port (optional)</label>
              <input
                type="number"
                min={1024}
                max={65535}
                value={form.port || ""}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    port: e.target.value ? parseInt(e.target.value) : undefined,
                  }))
                }
                placeholder="4200"
                className="w-full bg-background border border-input rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/50 font-mono"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Model (optional)</label>
            <input
              value={form.model || ""}
              onChange={set("model")}
              placeholder="anthropic/claude-3-5-sonnet-20241022"
              className="w-full bg-background border border-input rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/50 font-mono"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Skills (comma-separated)</label>
            <input
              value={skillsInput}
              onChange={(e) => setSkillsInput(e.target.value)}
              placeholder="github-deploy, cloudflare-deploy"
              className="w-full bg-background border border-input rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/50"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">System Prompt *</label>
            <textarea
              required
              value={form.systemPrompt}
              onChange={set("systemPrompt")}
              rows={5}
              placeholder="You are an expert web developer specializing in React and TypeScript..."
              className="w-full bg-background border border-input rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/50 resize-none font-mono leading-relaxed"
            />
          </div>

          {error && (
            <div className="bg-destructive/10 border border-error/30 text-destructive text-xs px-3 py-2 rounded-lg">
              {error}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 text-sm font-medium text-muted-foreground border border-input rounded-lg hover:bg-card-hover transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 py-2 text-sm font-medium bg-primary text-background rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {submitting ? "Guardando..." : agent ? "Guardar Cambios" : "Register Agent"}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

interface AgentsPageProps {
  onSelectAgent?: (agent: { id: string; name: string }) => void;
}

export function AgentsPage({ onSelectAgent }: AgentsPageProps) {
  const { agents, loading, error, fetchAgents, registerAgent, stopAgent, updateAgent } = useAgents();
  const [showRegister, setShowRegister] = useState(false);
  const [editingAgent, setEditingAgent] = useState<AgentInfo | null>(null);
  const [selectedAgentForExecutions, setSelectedAgentForExecutions] = useState<{ id: string; name: string } | null>(null);

  const handleEditClick = (agent: AgentInfo) => {
    setEditingAgent(agent);
    setShowRegister(true);
  };

  const handleRegisterOrUpdate = async (def: AgentDefinition) => {
    if (editingAgent) {
      // Exclude ID from updates
      const { id, ...updates } = def;
      await updateAgent(editingAgent.id, updates);
    } else {
      await registerAgent(def);
    }
  };

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden">
      <div className="flex items-center justify-between px-6 py-5 border-b border-border flex-shrink-0">
        <div>
          <h1 className="text-base font-semibold text-foreground">Agents</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Programmatic agents — independent AI workers with isolated workspaces
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchAgents}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-card-hover rounded-lg transition-colors"
            title="Refresh"
          >
            <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
            </svg>
          </button>
          <button
            onClick={() => {
              setEditingAgent(null);
              setShowRegister(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary text-background rounded-lg hover:bg-primary/90 transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
            </svg>
            Register Agent
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        {loading && (
          <div className="flex items-center justify-center h-32">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!loading && error && (
          <div className="flex flex-col items-center justify-center h-32 text-destructive text-sm gap-2">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" className="opacity-60">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            {error}
          </div>
        )}

        {!loading && !error && agents.length === 0 && (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-3">
            <div className="w-12 h-12 rounded-2xl bg-card border border-input flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" className="text-muted-foreground/50">
                <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
              </svg>
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">No agents running</p>
              <p className="text-xs mt-1">Register your first agent to get started</p>
            </div>
            <button
              onClick={() => {
                setEditingAgent(null);
                setShowRegister(true);
              }}
              className="px-4 py-2 text-xs font-medium bg-primary/10 text-primary border border-primary/20 rounded-lg hover:bg-primary/20 transition-colors"
            >
              Register Agent
            </button>
          </div>
        )}

        {!loading && !error && agents.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <AnimatePresence mode="popLayout">
              {agents.map((agent) => (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  onDelete={stopAgent}
                  onEdit={handleEditClick}
                  onChat={(agentObj) => onSelectAgent?.(agentObj)}
                  onExecutions={(agentObj) => setSelectedAgentForExecutions(agentObj)}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      <AnimatePresence>
        {showRegister && (
          <RegisterModal
            agent={editingAgent}
            onClose={() => {
              setShowRegister(false);
              setEditingAgent(null);
            }}
            onSubmit={handleRegisterOrUpdate}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedAgentForExecutions && (
          <ExecutionsModal
            agent={selectedAgentForExecutions}
            onClose={() => setSelectedAgentForExecutions(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function ExecutionsModal({
  agent,
  onClose,
}: {
  agent: { id: string; name: string };
  onClose: () => void;
}) {
  const [executions, setExecutions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedExec, setSelectedExec] = useState<any | null>(null);
  const [execDetail, setExecDetail] = useState<any | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    const fetchExecs = async () => {
      setLoading(true);
      setError(null);
      try {
        const token = localStorage.getItem("token") || "";
        const res = await fetch(`/api/agents/${agent.id}/executions`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setExecutions(data.executions || []);
      } catch (err: any) {
        setError(err.message || "Failed to load executions");
      } finally {
        setLoading(false);
      }
    };
    fetchExecs();
  }, [agent.id]);

  const loadDetail = async (execId: string) => {
    setLoadingDetail(true);
    try {
      const token = localStorage.getItem("token") || "";
      const res = await fetch(`/api/agents/${agent.id}/executions/${execId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setExecDetail(data);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleSelectExec = (exec: any) => {
    setSelectedExec(exec);
    setExecDetail(null);
    loadDetail(exec.id);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 8 }}
        transition={{ duration: 0.18 }}
        className="relative w-full max-w-4xl h-[80vh] bg-card border border-input rounded-2xl shadow-2xl overflow-hidden flex flex-col"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-input flex-shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Historial de Ejecuciones: {agent.name}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Analizá el rendimiento y logs de tareas delegadas</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-card-hover transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 11-1.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        <div className="flex-1 flex overflow-hidden min-h-0">
          {/* Execution List */}
          <div className="w-1/3 border-r border-input overflow-y-auto p-3 flex flex-col gap-2 bg-background/50 flex-shrink-0">
            {loading && (
              <div className="flex items-center justify-center py-10">
                <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            )}
            {!loading && error && (
              <p className="text-xs text-destructive p-3">{error}</p>
            )}
            {!loading && !error && executions.length === 0 && (
              <p className="text-xs text-muted-foreground p-3 text-center">Sin ejecuciones registradas.</p>
            )}
            {!loading && !error && executions.map((exec) => (
              <button
                key={exec.id}
                onClick={() => handleSelectExec(exec)}
                className={`text-left p-3 rounded-xl border text-xs flex flex-col gap-1 transition-all ${
                  selectedExec?.id === exec.id
                    ? "bg-primary/10 border-primary/30 text-foreground"
                    : "bg-card border-input text-muted-foreground hover:border-input/80 hover:text-foreground"
                }`}
              >
                <div className="flex justify-between items-center w-full">
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {exec.id.slice(0, 8)}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(exec.createdAt).toLocaleTimeString()}
                  </span>
                </div>
                <p className="font-medium text-foreground truncate w-full mt-0.5">{exec.prompt}</p>
                <div className="flex gap-2 text-[10px] text-muted-foreground mt-1">
                  <span>{(exec.durationMs / 1000).toFixed(1)}s</span>
                  {exec.errors && exec.errors.length > 0 && (
                    <span className="text-destructive font-medium">⚠️ {exec.errors.length} Error/es</span>
                  )}
                </div>
              </button>
            ))}
          </div>

          {/* Details Pane */}
          <div className="flex-1 overflow-y-auto p-5 bg-card flex flex-col gap-4">
            {!selectedExec && (
              <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground/50">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mb-2">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 16v-4" />
                  <path d="M12 8h.01" />
                </svg>
                <p className="text-xs">Seleccioná una ejecución para ver el detalle</p>
              </div>
            )}

            {selectedExec && (
              <>
                <div>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Prompt</h3>
                  <p className="text-sm font-medium text-foreground bg-background p-3 rounded-lg border border-input mt-1.5 leading-relaxed">
                    {selectedExec.prompt}
                  </p>
                </div>

                {loadingDetail && (
                  <div className="flex items-center justify-center py-10">
                    <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  </div>
                )}

                {!loadingDetail && execDetail && (
                  <>
                    {/* Metrics */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-background/50 border border-input rounded-xl p-3 flex flex-col">
                        <span className="text-[10px] text-muted-foreground">Duración de Ejecución</span>
                        <span className="text-sm font-semibold text-foreground mt-0.5">
                          {(execDetail.durationMs / 1000).toFixed(2)} segundos
                        </span>
                      </div>
                      <div className="bg-background/50 border border-input rounded-xl p-3 flex flex-col">
                        <span className="text-[10px] text-muted-foreground">Estatus</span>
                        <span className={`text-sm font-semibold mt-0.5 ${execDetail.errors?.length > 0 ? "text-destructive" : "text-primary"}`}>
                          {execDetail.errors?.length > 0 ? `${execDetail.errors.length} Error/es` : "Exitoso"}
                        </span>
                      </div>
                    </div>

                    {/* Errors if any */}
                    {execDetail.errors && execDetail.errors.length > 0 && (
                      <div className="border border-error/20 bg-destructive/5 rounded-xl p-4 flex flex-col gap-2">
                        <h4 className="text-xs font-bold text-destructive flex items-center gap-1.5">
                          ⚠️ Errores Encontrados
                        </h4>
                        <ul className="list-disc pl-4 text-xs text-destructive/90 space-y-1.5 font-mono">
                          {execDetail.errors.map((err: string, i: number) => (
                            <li key={i}>{err}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Tool Calls */}
                    <div>
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Herramientas Ejecutadas</h4>
                      {(!execDetail.toolCalls || execDetail.toolCalls.length === 0) ? (
                        <p className="text-xs text-muted-foreground italic">No se ejecutaron herramientas en esta tarea.</p>
                      ) : (
                        <div className="flex flex-col gap-2">
                          {execDetail.toolCalls.map((tc: any, i: number) => (
                            <details key={i} className="border border-input rounded-xl bg-background/30 overflow-hidden text-xs">
                              <summary className="p-3 font-mono font-medium hover:bg-card-hover cursor-pointer flex justify-between items-center select-none text-foreground">
                                <div className="flex items-center gap-2">
                                  <span className={tc.isError ? "text-destructive" : "text-primary"}>●</span>
                                  <span>{tc.name}</span>
                                </div>
                                <span className="text-[10px] text-muted-foreground font-sans">
                                  {tc.endedAt ? `${((new Date(tc.endedAt).getTime() - new Date(tc.startedAt).getTime()) / 1000).toFixed(2)}s` : "corriendo"}
                                </span>
                              </summary>
                              <div className="p-4 border-t border-input bg-background/50 flex flex-col gap-3 font-mono">
                                <div>
                                  <span className="text-[10px] text-muted-foreground uppercase block mb-1">Argumentos</span>
                                  <pre className="text-xs bg-background p-2.5 rounded-lg overflow-x-auto text-foreground max-h-40">
                                    {JSON.stringify(tc.args, null, 2)}
                                  </pre>
                                </div>
                                {tc.result && (
                                  <div>
                                    <span className="text-[10px] text-muted-foreground uppercase block mb-1">Resultado</span>
                                    <pre className="text-xs bg-background p-2.5 rounded-lg overflow-x-auto text-foreground max-h-60 whitespace-pre-wrap">
                                      {typeof tc.result === "string" ? tc.result : JSON.stringify(tc.result, null, 2)}
                                    </pre>
                                  </div>
                                )}
                              </div>
                            </details>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Message Logs */}
                    <div>
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Mensajes de Sesión</h4>
                      <div className="flex flex-col gap-2 border border-input rounded-xl p-3 bg-background/20">
                        {execDetail.messages?.filter((m: any) => m.role !== "system").map((m: any, i: number) => (
                          <div key={i} className={`p-2.5 rounded-lg text-xs leading-relaxed ${m.role === "user" ? "bg-primary/5 ml-8 border border-primary/10" : "bg-card-hover mr-8 border border-input"}`}>
                            <div className="font-semibold text-foreground mb-1 uppercase tracking-wider text-[9px] text-muted-foreground">
                              {m.role}
                            </div>
                            <div className="whitespace-pre-wrap text-foreground font-mono text-[11px] leading-normal bg-background/30 p-1.5 rounded border border-input/30 mt-1">
                              {typeof m.content === "string" ? m.content : JSON.stringify(m.content)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
